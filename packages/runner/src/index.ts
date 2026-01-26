#!/usr/bin/env node
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceManager } from './workspace';
import { SimulatorController } from './simulator';
import { RunnerError } from './errors';
import dotenv from 'dotenv';
import { program } from 'commander';

dotenv.config();

const execAsync = promisify(exec);

async function start(config: { port: number, storagePath?: string, nativeAppPath?: string }) {
    const workspace = new WorkspaceManager(config.storagePath);
    const sim = new SimulatorController();

    await workspace.init();
    const token = await workspace.getOrCreateToken();

    const app = express();
    app.use(cors({
        origin: true,
        allowedHeaders: ['Content-Type', 'X-Runner-Token']
    }));
    app.use(express.json());

    const errorHandler = (res: express.Response, error: any) => {
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

    // Security Middleware
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
        // Enforce localhost only
        const remoteAddress = req.socket.remoteAddress;
        if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== '::ffff:127.0.0.1') {
            console.log(chalk.red(`Blocked non-localhost request from ${remoteAddress}`));
            return res.status(403).json({ error: 'Access restricted to localhost' });
        }

        if (req.path === '/health') return next();

        const receivedToken = req.headers['x-runner-token'];
        if (receivedToken !== token) {
            return res.status(401).json({ error: 'Invalid or missing runner token' });
        }
        next();
    });

    // --- API Endpoints ---

    app.get('/health', async (_req: express.Request, res: express.Response) => {
        try {
            const booted = await sim.getBootedDevice();
            res.json({
                status: 'ready',
                platforms: ['ios'],
                simulators: booted ? [booted.name] : [],
                version: '0.1.0',
                capabilities: {
                    mirror: ['screenshot'],
                    logs: ['websocket']
                }
            });
        } catch (error) {
            errorHandler(res, error);
        }
    });

    app.post('/sync', async (req: express.Request, res: express.Response) => {
        const { sessionId, files } = req.body;
        if (!sessionId || !files) return res.status(400).json({ error: 'Missing sessionId or files' });

        try {
            const sessionPath = await workspace.setupSession(sessionId);
            await workspace.syncFiles(sessionPath, files);
            res.json({ success: true, path: sessionPath });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    let lastBooted: { udid: string, name: string } | null = null;
    let lastBootCheck = 0;

    app.get('/screenshot', async (_req: express.Request, res: express.Response) => {
        try {
            // Only refresh device list every 5 seconds to reduce simctl load
            const now = Date.now();
            if (!lastBooted || (now - lastBootCheck) > 5000) {
                const booted = await sim.getBootedDevice();
                if (booted) {
                    lastBooted = { udid: booted.udid, name: booted.name };
                } else {
                    lastBooted = null;
                }
                lastBootCheck = now;
            }

            if (!lastBooted) {
                return res.status(404).json({ error: 'No booted simulator found' });
            }

            const { stdout } = await execAsync(`xcrun simctl io ${lastBooted.udid} screenshot -`, {
                encoding: 'buffer',
                maxBuffer: 10 * 1024 * 1024, // 10MB
                timeout: 5000 // 5s timeout
            });

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('X-Derived-From', lastBooted.name);
            res.send(stdout);
        } catch (error: any) {
            // For transient simctl errors (e.g. while booting or high load), return 503
            // This prevents the browser from showing scary 500 errors in console if it's just a retryable failure
            console.warn('[Screenshot Warning]', error.message || error);

            // If the failure is persistent, invalidate cache
            if (error.message?.includes('Unable to find device') || error.message?.includes('No such file')) {
                lastBooted = null;
            }

            res.status(503).json({
                error: 'Simulator mirror temporarily unavailable',
                details: error.message
            });
        }
    });

    app.post('/stop', async (req: express.Request, res: express.Response) => {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

        try {
            await workspace.cleanupSession(sessionId);
            res.json({ success: true });
        } catch (error) {
            errorHandler(res, error);
        }
    });

    app.post('/run', async (req: express.Request, res: express.Response) => {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

        const log = (message: string, type: 'info' | 'error' | 'warn' = 'info') => {
            (app as any).broadcastLog(sessionId, {
                type,
                message,
                timestamp: new Date()
            });
        };

        try {
            // 1. Check Expo
            try {
                await execAsync('npx expo --version');
            } catch (e) {
                throw new RunnerError('EXPO_NOT_FOUND', 'Expo CLI not found locally.', 'Run: npm install -g expo');
            }

            // 2. Ensure Simulator is ready
            log('Ensuring simulator is ready...');
            const device = await sim.ensureSimulatorReady();
            log(`Simulator ${device.name} is ready.`);

            // 3. Sync files to native app directory
            log('Syncing files to native project...');
            const nativeAppDir = config.nativeAppPath || process.env.NATIVE_APP_PATH || path.join(process.cwd(), '..', '..', 'apps', 'native');

            if (!(await workspace.syncSessionToDirectory(sessionId, nativeAppDir).then(() => true).catch(() => false))) {
                // If it fails, maybe the path is wrong or session missing
                throw new RunnerError('INTERNAL_ERROR', `Failed to sync to: ${nativeAppDir}`);
            }
            log('Files synced.');

            // 4. Start Expo and Launch on iOS
            log('Launching app via Expo...');
            // We run 'npx expo start --ios' in the background. 
            // If it's already running, Expo usually handles it or we'll get a warning.
            // Using a detached process so it doesn't block the response.
            const expoProcess = exec('npx expo start --ios', { cwd: nativeAppDir });

            expoProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                if (output.includes('Opening on iOS')) {
                    log('App launch triggered.');
                }
            });

            expoProcess.stderr?.on('data', (data) => {
                console.error(`[Expo Error] ${data}`);
            });

            res.json({
                success: true,
                device: device.name,
                message: `Session ${sessionId} is launching on ${device.name}`
            });

            log(`Successfully started session ${sessionId} on ${device.name}`);
        } catch (error) {
            errorHandler(res, error);
            log(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    });

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

    wss.on('connection', (ws: any, _req: any, sessionId: string | null) => {
        console.log(chalk.blue(`Browser connected to logs [session: ${sessionId || 'global'}]`));
        ws.send(JSON.stringify({
            type: 'info',
            message: `Connected to Runner Log Stream (${sessionId || 'global'})`
        }));

        ws.sessionId = sessionId;
    });

    // Helper for broadcasting
    (app as any).broadcastLog = (sessionId: string, log: any) => {
        wss.clients.forEach(client => {
            const ws = client as any;
            if (ws.readyState === 1 && (!sessionId || ws.sessionId === sessionId)) {
                ws.send(JSON.stringify(log));
            }
        });
    };

    server.listen(config.port, '127.0.0.1', () => {
        console.log(chalk.green('\n🚀 RN Playground Local Runner Active'));
        console.log(chalk.cyan(`📍 URL: http://127.0.0.1:${config.port}`));
        console.log(chalk.yellow(`🔑 Token: ${token}`));
        console.log(chalk.gray('-------------------------------------------\n'));
    });
}

program
    .name('rn-playground-runner')
    .description('Local runner for React Native Playground')
    .version('0.1.0')
    .option('-p, --port <number>', 'port to listen on', '3001')
    .option('-s, --storage <path>', 'path for session storage')
    .option('-n, --native <path>', 'path to native expo project boilerplate')
    .parse(process.argv);

const options = program.opts();

start({
    port: parseInt(options.port, 10),
    storagePath: options.storage,
    nativeAppPath: options.native
}).catch(err => {
    console.error(chalk.red('Failed to start runner:'), err);
    process.exit(1);
});
