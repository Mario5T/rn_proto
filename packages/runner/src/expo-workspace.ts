import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { RunnerError } from './errors';

const execAsync = promisify(exec);

const BASE_PATH = path.join(os.homedir(), '.rn-playground');
const WORKSPACE_PATH = path.join(BASE_PATH, 'native');

/**
 * Checks if a workspace directory is valid and usable.
 */
export async function isWorkspaceValid(workspacePath: string): Promise<boolean> {
    const requiredFiles = ['package.json', 'App.tsx'];
    const requiredDirs = ['node_modules'];

    for (const file of requiredFiles) {
        if (!(await fs.pathExists(path.join(workspacePath, file)))) {
            return false;
        }
    }

    for (const dir of requiredDirs) {
        const dirPath = path.join(workspacePath, dir);
        if (!(await fs.pathExists(dirPath))) {
            return false;
        }
        // Check node_modules has content
        if (dir === 'node_modules') {
            const contents = await fs.readdir(dirPath);
            if (contents.length < 5) {
                return false; // Likely incomplete install
            }
        }
    }

    return true;
}

/**
 * Ensures the native workspace exists and is valid.
 * Creates from scratch using create-expo-app if missing or corrupted.
 * 
 * CRITICAL: Always runs `expo prebuild` to ensure ios/ directory is valid
 * and ready for direct xcodebuild.
 */
export async function ensureWorkspace(): Promise<string> {
    await fs.ensureDir(BASE_PATH);

    let workspaceExists = await fs.pathExists(WORKSPACE_PATH);

    // 1. Validate existing workspace
    if (workspaceExists) {
        if (await isWorkspaceValid(WORKSPACE_PATH)) {
            console.log(chalk.green('✓ Native workspace valid (reusing existing)'));
        } else {
            console.log(chalk.yellow('⚠ Existing workspace is corrupted. Recreating...'));
            await fs.remove(WORKSPACE_PATH);
            workspaceExists = false;
        }
    }

    // 2. Create new workspace if needed
    if (!workspaceExists) {
        console.log(chalk.blue('📦 Creating native workspace...'));
        console.log(chalk.gray(`  Location: ${WORKSPACE_PATH}`));

        try {
            // Use create-expo-app with blank template
            await execAsync(
                `npx create-expo-app@latest "${WORKSPACE_PATH}" --template blank-typescript --yes`,
                { timeout: 300000 } // 5 min timeout for npm install
            );
        } catch (error: any) {
            throw new RunnerError(
                'WORKSPACE_CORRUPT',
                `Failed to create native workspace: ${error.message}`,
                'Check your internet connection and verify npm is working.'
            );
        }

        // Verify creation
        if (!(await isWorkspaceValid(WORKSPACE_PATH))) {
            throw new RunnerError(
                'WORKSPACE_CORRUPT',
                'Workspace was created but is incomplete.',
                'Delete ~/.rn-playground/native and restart the runner.'
            );
        }
        console.log(chalk.green('✓ Native workspace created successfully'));
    }

    // 3. Ensure native project generation (Prebuild)
    // We run `expo prebuild` once to generate the ios/ directory.
    // The actual native build is handled by `expo run:ios` in the runner,
    // which correctly configures Xcode, installs Pods, and targets the simulator.
    const iosPath = path.join(WORKSPACE_PATH, 'ios');
    const podfileLockPath = path.join(iosPath, 'Podfile.lock');

    if (!fs.existsSync(iosPath) || !fs.existsSync(podfileLockPath)) {
        console.log(chalk.blue('⚙️  Generating native iOS project (one-time setup)...'));
        try {
            await execAsync('npx expo prebuild --platform ios --clean', {
                cwd: WORKSPACE_PATH,
                env: {
                    ...process.env,
                    EXPO_NO_TELEMETRY: '1',
                    EXPO_NO_UPDATE_CHECK: '1'
                },
                timeout: 120000 // 2 min
            });
            console.log(chalk.green('✓ Native iOS project generated'));
        } catch (error: any) {
            throw new RunnerError(
                'WORKSPACE_CORRUPT',
                `Failed to generate native project: ${error.message}`,
                'Check Expo config and try again.'
            );
        }
    } else {
        console.log(chalk.green('✓ Native iOS project ready'));
    }

    return WORKSPACE_PATH;
}


/**
 * File name mappings from playground conventions → native workspace conventions.
 *
 * The web playground uses .jsx extensions by default (e.g. App.jsx) while the
 * native workspace is bootstrapped with TypeScript (App.tsx). We normalize these
 * so the user's code always lands in the right file.
 */
const FILE_NAME_MAP: Record<string, string> = {
    'App.jsx': 'App.tsx',
    'App.js': 'App.tsx',
};

/**
 * Syncs files from a session directory to the native workspace.
 *
 * Rules:
 * - Apply FILE_NAME_MAP to normalize playground file names to native conventions.
 * - Never overwrite files that control the native build (package.json, etc.).
 * - Never touch node_modules, .expo, or hidden directories.
 */
export async function syncToWorkspace(
    sessionPath: string,
    workspacePath: string = WORKSPACE_PATH
): Promise<void> {
    const files = await fs.readdir(sessionPath);

    // Files that must NEVER be overwritten in the native workspace
    const skipFiles = new Set([
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'babel.config.js',
        'babel.config.ts',
        'metro.config.js',
        'metro.config.ts',
        'app.json',
        'app.config.js',
        'app.config.ts',
        'node_modules',
        '.expo',
    ]);

    for (const file of files) {
        if (skipFiles.has(file) || file.startsWith('.')) {
            continue;
        }

        // Normalize file name if needed (e.g. App.jsx → App.tsx)
        const destName = FILE_NAME_MAP[file] ?? file;

        const src = path.join(sessionPath, file);
        const dest = path.join(workspacePath, destName);

        const stats = await fs.stat(src);
        if (stats.isFile() || stats.isDirectory()) {
            await fs.copy(src, dest, { overwrite: true });
        }
    }
}

export function getWorkspacePath(): string {
    return WORKSPACE_PATH;
}
