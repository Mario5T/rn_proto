#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import chalk from 'chalk';
import { exec, ChildProcess, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import { SimulatorController } from './simulator';
import { RunnerError } from './errors';
import { bootstrap, BootstrapResult } from './bootstrap';
import { getWorkspacePath, syncToWorkspace } from './expo-workspace';
import { program } from 'commander';

const execAsync = promisify(exec);
const RUNNER_VERSION = '0.3.0';
const BASE_PATH = path.join(os.homedir(), '.rn-playground');
const SESSIONS_PATH = path.join(BASE_PATH, 'sessions');

// Unique instance ID - generated fresh on every runner start
// Used by clients to detect runner restarts and invalidate stale tokens
const RUNNER_ID = crypto.randomUUID();

// ─────────────────────────────────────────────
// Module-level state (single source of truth)
// ─────────────────────────────────────────────

/** Metro bundler process. Null = not started. */
let metroProcess: ChildProcess | null = null;

/** Whether the native app has been built + installed at least once this session. */
let nativeInstalled = false;

/**
 * Checks if the Metro process is still alive.
 */
function isMetroAlive(): boolean {
    if (!metroProcess) return false;
    return metroProcess.exitCode === null && !metroProcess.killed;
}

// ─────────────────────────────────────────────
// Metro Reload
// ─────────────────────────────────────────────

/**
 * Sends a Metro reload command via WebSocket.
 * Metro WS protocol: { version: 2, type: "reload" }
 */
async function reloadViaWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://localhost:8081/message');
        const timeout = setTimeout(() => {
            ws.terminate();
            reject(new Error('WebSocket reload timed out'));
        }, 3000);

        ws.on('open', () => {
            ws.send(JSON.stringify({ version: 2, type: 'reload' }));
            clearTimeout(timeout);
            ws.close();
            resolve();
        });

        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}

/**
 * Triggers Metro to hot-reload the running app.
 * Strategy: WebSocket first (modern, fast), then HTTP fallback (universal).
 * Never fails silently — always logs the method used.
 */
async function triggerMetroReload(): Promise<void> {
    try {
        await reloadViaWebSocket();
        console.log(chalk.green('  ✓ Metro reload triggered (WebSocket)'));
    } catch (wsErr) {
        console.log(chalk.gray(`  ⚠ WS reload failed (${(wsErr as Error).message}), trying HTTP fallback...`));
        try {
            await execAsync('curl -s -X POST http://localhost:8081/reload', { timeout: 3000 });
            console.log(chalk.green('  ✓ Metro reload triggered (HTTP fallback)'));
        } catch (httpErr) {
            // Log but don't throw — Metro's file watcher may still pick up the change
            console.warn(chalk.yellow('  ⚠ Metro reload both methods failed. Metro file-watch will handle it.'));
        }
    }
}

// ─────────────────────────────────────────────
// Metro Process Management
// ─────────────────────────────────────────────

/**
 * Starts Metro bundler in the background as a standalone process.
 * Metro is started separately from the Expo build to give us control
 * over its lifecycle after the initial `expo run:ios` build.
 */
function startMetroProcess(workspacePath: string): ChildProcess {
    console.log(chalk.blue('  Starting Metro bundler...'));

    const metro = spawn('npx', ['expo', 'start', '--no-dev', '--minify', '--non-interactive'], {
        cwd: workspacePath,
        env: {
            ...process.env,
            CI: '0', // Don't use CI mode - we need Metro to stay running
            EXPO_NO_TELEMETRY: '1',
            EXPO_NO_UPDATE_CHECK: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    metro.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        // Only log important Metro events
        if (output.includes('Bundling') || output.includes('Started') || output.includes('Ready') || output.includes('error')) {
            console.log(chalk.gray(`[Metro] ${output.trim().split('\n')[0]}`));
        }
    });

    metro.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (!output.includes('WARN') && !output.includes('deprecated') && !output.includes('notice')) {
            console.error(chalk.yellow(`[Metro] ${output.trim()}`));
        }
    });

    metro.on('exit', (code) => {
        console.log(chalk.gray(`[Metro] Process exited with code ${code}`));
        metroProcess = null;
    });

    return metro;
}

/**
 * Waits for Metro to be ready by polling the bundle URL.
 * Times out after 60 seconds.
 */
async function waitForMetro(timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await execAsync('curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status', { timeout: 2000 });
            return; // Metro is up
        } catch {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    throw new Error('Metro did not become ready within 60 seconds');
}

// ─────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────

async function startServer(bootstrapResult: BootstrapResult, port: number) {
    const sim = new SimulatorController();

    const app = express();
    app.use(cors({
        origin: true,
        allowedHeaders: ['Content-Type', 'X-Runner-Token']
    }));
    app.use(express.json());

    const errorHandler = (res: express.Response, error: unknown) => {
        if (error instanceof RunnerError) {
            return res.status(400).json(error.toJSON());
        }
        console.error(chalk.red('Unexpected error:'), error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: String(error)
            }
        });
    };

    // ── Security Middleware ──────────────────
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        // Enforce localhost only
        const remoteAddress = req.socket.remoteAddress;
        if (
            remoteAddress !== '127.0.0.1' &&
            remoteAddress !== '::1' &&
            remoteAddress !== '::ffff:127.0.0.1'
        ) {
            console.log(chalk.red(`Blocked non-localhost request from ${remoteAddress}`));
            return res.status(403).json({ error: 'Access restricted to localhost' });
        }

        // /health does not require authentication per spec
        if (req.path === '/health') return next();

        const receivedToken = req.headers['x-runner-token'];
        if (receivedToken !== bootstrapResult.token) {
            return res.status(401).json({ error: 'Invalid or missing runner token' });
        }
        next();
    });

    // ── GET /health ──────────────────────────
    app.get('/health', async (_req: express.Request, res: express.Response) => {
        try {
            const booted = await sim.getBootedDevice();
            const workspaceValid = await fs.pathExists(path.join(getWorkspacePath(), 'package.json'));
            const ok = !!booted && workspaceValid;

            res.json({
                ok,
                runnerId: RUNNER_ID,
                platform: 'ios',
                simulator: booted ? 'booted' : 'not_booted',
                simulatorName: booted?.name,
                expo: 'ready',
                workspace: workspaceValid ? 'ready' : 'not_ready',
                metroRunning: isMetroAlive(),
                nativeInstalled,
                runnerVersion: RUNNER_VERSION
            });
        } catch (error) {
            res.json({
                ok: false,
                runnerId: RUNNER_ID,
                platform: 'ios',
                simulator: 'error',
                expo: 'unknown',
                workspace: 'unknown',
                metroRunning: false,
                nativeInstalled,
                runnerVersion: RUNNER_VERSION,
                error: String(error)
            });
        }
    });

    // ── POST /sync ───────────────────────────
    app.post('/sync', async (req: express.Request, res: express.Response) => {
        const { sessionId, files } = req.body;
        if (!sessionId || !files) {
            return res.status(400).json({ error: 'Missing sessionId or files' });
        }

        try {
            const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
            const sessionPath = path.join(SESSIONS_PATH, safeId);
            await fs.ensureDir(sessionPath);

            // Write files to session directory
            for (const [filename, content] of Object.entries(files)) {
                const filePath = path.join(sessionPath, filename);
                await fs.ensureDir(path.dirname(filePath));
                await fs.writeFile(filePath, content as string, 'utf-8');
            }

            // Sync to native workspace
            await syncToWorkspace(sessionPath);

            res.json({ success: true, path: sessionPath });
        } catch (error) {
            console.error('[Sync Error]', error);
            res.status(500).json({ error: String(error) });
        }
    });

    // ── POST /run ────────────────────────────
    /**
     * Idempotent run endpoint.
     *
     * Phase 1 (first run): `expo run:ios --device <UDID>`
     *   - Builds the native app
     *   - Installs it on the simulator
     *   - Starts Metro (as a child of the Expo process)
     *
     * Phase 2 (subsequent runs): Metro hot reload only
     *   - Files already synced by /sync
     *   - Send reload command to Metro (WS → HTTP fallback)
     *   - NO native rebuild, EVER
     */
    app.post('/run', async (req: express.Request, res: express.Response) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }

        const broadcast = (app as any).broadcastLog;
        const log = (message: string, type: 'info' | 'error' | 'warn' = 'info') => {
            broadcast(sessionId, { type, message, timestamp: new Date() });
        };

        try {
            const workspacePath = getWorkspacePath();
            const simulatorUdid = bootstrapResult.simulator.udid;
            const simulatorName = bootstrapResult.simulator.name;

            // Step 1: Sync session files to workspace (idempotent, always run)
            const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
            const sessionPath = path.join(SESSIONS_PATH, safeId);
            if (await fs.pathExists(sessionPath)) {
                log('Syncing files to native project...');
                await syncToWorkspace(sessionPath);
                log('Files synced.');
            }

            // ── PHASE 2: Hot Reload (fast path) ─────────────
            if (nativeInstalled && isMetroAlive()) {
                log(`Metro is running — triggering hot reload on ${simulatorName}...`);
                await triggerMetroReload();
                log(`App reloaded on ${simulatorName} ✓`);

                return res.json({
                    success: true,
                    device: simulatorName,
                    message: `App reloaded on ${simulatorName}`,
                    phase: 'hot-reload'
                });
            }

            // ── PHASE 1: First-time native build ─────────────
            // This runs ONCE. After this, we only hot-reload.
            log(`Building native app for ${simulatorName} (this runs once)...`);
            log('This may take 3–5 minutes on first run. Subsequent runs will be instant.');

            console.log(chalk.blue(`\n🔨 expo run:ios --device ${simulatorUdid}`));
            console.log(chalk.gray('  This is the ONLY native build. All future updates use Metro reload.'));

            await new Promise<void>((resolve, reject) => {
                // expo run:ios: builds native, installs on simulator, starts Metro
                const expoRun = spawn(
                    'npx',
                    ['expo', 'run:ios', '--device', simulatorUdid, '--no-bundler'],
                    {
                        cwd: workspacePath,
                        env: {
                            ...process.env,
                            EXPO_NO_TELEMETRY: '1',
                            EXPO_NO_UPDATE_CHECK: '1',
                        },
                        stdio: ['ignore', 'pipe', 'pipe'],
                    }
                );

                let buildOutput = '';

                expoRun.stdout?.on('data', (data: Buffer) => {
                    const line = data.toString().trim();
                    buildOutput += line + '\n';

                    // Stream key progress lines to the browser log
                    if (
                        line.includes('Building') ||
                        line.includes('Installing') ||
                        line.includes('Launching') ||
                        line.includes('Compiling') ||
                        line.includes('Linking') ||
                        line.includes('Build succeeded') ||
                        line.includes('error')
                    ) {
                        console.log(chalk.gray(`  [expo] ${line.split('\n')[0]}`));
                        log(line.split('\n')[0]);
                    }
                });

                expoRun.stderr?.on('data', (data: Buffer) => {
                    const line = data.toString().trim();
                    if (!line.includes('WARN') && !line.includes('deprecated') && line.length > 0) {
                        console.error(chalk.yellow(`  [expo] ${line}`));
                    }
                });

                expoRun.on('exit', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new RunnerError(
                            'INTERNAL_ERROR',
                            `expo run:ios failed with exit code ${code}`,
                            'Check the output above for build errors.'
                        ));
                    }
                });

                expoRun.on('error', (err) => {
                    reject(new RunnerError(
                        'INTERNAL_ERROR',
                        `Failed to spawn expo run:ios: ${err.message}`,
                        'Ensure Expo CLI is installed: npm install -g expo'
                    ));
                });
            });

            // Mark native as installed — we never rebuild after this
            nativeInstalled = true;
            log(`Native app installed on ${simulatorName} ✓`);
            console.log(chalk.green('\n✓ Native app built and installed. Future runs will use Metro hot reload.'));

            // Start Metro as a standalone process for the hot-reload loop
            if (!isMetroAlive()) {
                log('Starting Metro bundler...');
                metroProcess = startMetroProcess(workspacePath);

                // Wait for Metro to be ready before responding
                try {
                    log('Waiting for Metro to be ready...');
                    await waitForMetro(60000);
                    log('Metro is ready ✓');
                } catch {
                    // Non-fatal — Metro might still start after we respond
                    log('Metro startup check timed out, proceeding anyway...', 'warn');
                }
            }

            log(`App is running on ${simulatorName} ✓`);

            res.json({
                success: true,
                device: simulatorName,
                udid: simulatorUdid,
                message: `App running on ${simulatorName}`,
                phase: 'native-build'
            });

        } catch (error) {
            errorHandler(res, error);
            log(`Failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    });

    // ── GET /screenshot ───────────────────────
    app.get('/screenshot', async (_req: express.Request, res: express.Response) => {
        try {
            const booted = sim.getActiveSimulator() || await sim.getBootedDevice();
            if (!booted) {
                return res.status(404).json({ error: 'No booted simulator found' });
            }

            const { stdout } = await execAsync(`xcrun simctl io ${booted.udid} screenshot -`, {
                encoding: 'buffer' as BufferEncoding,
                maxBuffer: 10 * 1024 * 1024,
                timeout: 5000
            }) as unknown as { stdout: Buffer };

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('X-Derived-From', booted.name);
            res.send(stdout);
        } catch (error: unknown) {
            const err = error as Error & { message?: string };
            console.warn('[Screenshot Warning]', err.message || err);
            res.status(503).json({
                error: 'Simulator mirror temporarily unavailable',
                details: err.message
            });
        }
    });

    // ── POST /stop ────────────────────────────
    app.post('/stop', async (req: express.Request, res: express.Response) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }

        try {
            const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
            const sessionPath = path.join(SESSIONS_PATH, safeId);
            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
            }
            res.json({ success: true });
        } catch (error) {
            errorHandler(res, error);
        }
    });

    // ── WebSocket: Log Streaming ──────────────
    const server = createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`);
        if (url.pathname === '/logs') {
            const sid = url.searchParams.get('sessionId');
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, sid);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws: WebSocket & { sessionId?: string | null }, _req: unknown, sessionId: string | null) => {
        console.log(chalk.blue(`Browser connected to logs [session: ${sessionId || 'global'}]`));
        ws.send(JSON.stringify({
            type: 'info',
            message: `Connected to sim-bridge log stream (${sessionId || 'global'})`
        }));
        ws.sessionId = sessionId;
    });

    (app as any).broadcastLog = (sessionId: string, log: unknown) => {
        wss.clients.forEach(client => {
            const ws = client as WebSocket & { sessionId?: string | null };
            if (ws.readyState === WebSocket.OPEN && (!sessionId || ws.sessionId === sessionId)) {
                ws.send(JSON.stringify(log));
            }
        });
    };

    // ── Start listening ───────────────────────
    server.listen(port, '127.0.0.1', () => {
        console.log(chalk.green('\n🚀 sim-bridge is running!'));
        console.log(chalk.cyan(`📍 URL:       http://127.0.0.1:${port}`));
        console.log(chalk.yellow(`🔑 Token:     ${bootstrapResult.token}`));
        console.log(chalk.gray(`📱 Simulator: ${bootstrapResult.simulator.name}`));
        console.log(chalk.gray(`📁 Workspace: ${bootstrapResult.workspace}`));
        console.log(chalk.gray('──────────────────────────────────────────'));
        console.log(chalk.white('Paste the token above into the web playground to connect.\n'));
    });
}

// ─────────────────────────────────────────────
// CLI Entry Point
// ─────────────────────────────────────────────
program
    .name('sim-bridge')
    .description('Zero-config native orchestrator for React Native Playground')
    .version(RUNNER_VERSION)
    .option('-p, --port <number>', 'port to listen on', '3001')
    .parse(process.argv);

const options = program.opts();
const port = parseInt(options.port, 10);

(async () => {
    try {
        const result = await bootstrap();
        await fs.ensureDir(SESSIONS_PATH);
        await startServer(result, port);
    } catch (err) {
        if (err instanceof RunnerError) {
            process.exit(1);
        }
        console.error(chalk.red('Fatal error:'), err);
        process.exit(1);
    }
})();
