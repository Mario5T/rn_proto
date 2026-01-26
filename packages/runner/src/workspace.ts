import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { RunnerError } from './errors';

export class WorkspaceManager {
    private readonly root: string;
    private readonly sessionsDir: string;
    private readonly templateDir: string;
    private readonly tokenFile: string;

    constructor(customRoot?: string) {
        this.root = customRoot || process.env.RUNNER_STORAGE_PATH || path.join(os.homedir(), '.rn-playground');
        this.sessionsDir = path.join(this.root, 'sessions');
        this.templateDir = path.join(this.root, 'template');
        this.tokenFile = path.join(this.root, 'token');
    }

    async init(): Promise<void> {
        await fs.ensureDir(this.sessionsDir);
        await fs.ensureDir(this.templateDir);

        // Background cleanup every 15 minutes
        setInterval(() => this.cleanupSessions(), 15 * 60 * 1000);
    }

    async getOrCreateToken(): Promise<string> {
        if (await fs.pathExists(this.tokenFile)) {
            return (await fs.readFile(this.tokenFile, 'utf-8')).trim();
        }
        const token = uuidv4();
        await fs.writeFile(this.tokenFile, token, 'utf-8');
        return token;
    }

    async setupSession(sessionId: string): Promise<string> {
        // Sanitize sessionId to prevent directory traversal
        const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
        const sessionPath = path.join(this.sessionsDir, safeId);
        await fs.ensureDir(sessionPath);

        // Update mtime to prevent premature cleanup
        const now = new Date();
        await fs.utimes(sessionPath, now, now);

        return sessionPath;
    }

    async syncFiles(sessionPath: string, files: Record<string, string>): Promise<void> {
        for (const [filename, content] of Object.entries(files)) {
            const filePath = path.join(sessionPath, filename);
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, content, 'utf-8');
        }
        // Update mtime on sync
        const now = new Date();
        await fs.utimes(sessionPath, now, now);
    }

    async cleanupSession(sessionId: string): Promise<void> {
        const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
        const sessionPath = path.join(this.sessionsDir, safeId);
        if (await fs.pathExists(sessionPath)) {
            await fs.remove(sessionPath);
        }
    }

    private async cleanupSessions(): Promise<void> {
        const sessions = await fs.readdir(this.sessionsDir);
        const now = Date.now();
        const MAX_AGE = 60 * 60 * 1000; // 1 hour

        for (const id of sessions) {
            const sessionPath = path.join(this.sessionsDir, id);
            const stats = await fs.stat(sessionPath);
            if (now - stats.mtimeMs > MAX_AGE) {
                console.log(`[Workspace] Cleaning up expired session: ${id}`);
                await fs.remove(sessionPath);
            }
        }
    }

    async syncSessionToDirectory(sessionId: string, targetDir: string): Promise<void> {
        const safeId = sessionId.replace(/[^a-zA-Z0-9-]/g, '');
        const sessionPath = path.join(this.sessionsDir, safeId);

        if (!(await fs.pathExists(sessionPath))) {
            throw new RunnerError('SESSION_NOT_FOUND', `Session ${sessionId} not found`);
        }

        // List files in session
        const files = await fs.readdir(sessionPath);
        for (const file of files) {
            const src = path.join(sessionPath, file);
            const dest = path.join(targetDir, file);

            // Skip common metadata files if they might break the native app
            if (file === 'package.json' || file === 'tsconfig.json' || file === 'babel.config.js' || file.startsWith('.')) {
                continue;
            }

            const stats = await fs.stat(src);
            if (stats.isFile()) {
                await fs.copy(src, dest, { overwrite: true });
            } else if (stats.isDirectory()) {
                await fs.ensureDir(dest);
                await fs.copy(src, dest, { overwrite: true });
            }
        }
    }

    getTemplatePath(): string {
        return this.templateDir;
    }
}
