import { useState, useCallback, useEffect } from 'react';
import type { PlaygroundState, ConsoleMessage } from '../bundler/types';
import { transformCode } from '../bundler/transformer';
import { generateIframeContent } from '../runtime/executor';
import { useLocalRunner } from './useLocalRunner';
import { getTemplate } from '../templates';
import { saveSession, loadSession, decompressFromUrl } from '../persistence/storage';

const DEFAULT_CODE = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello React Native!</Text>
      <Text style={styles.subtitle}>Welcome to JSX Playground</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
`;

export function usePlayground() {
    const [state, setState] = useState<PlaygroundState>({
        files: {
            'App.jsx': DEFAULT_CODE,
        },
        activeFile: 'App.jsx',
        openFiles: ['App.jsx'],
        dirtyFiles: [],
        consoleMessages: [],
        isRunning: false,
        error: null,
    });

    const [iframeContent, setIframeContent] = useState<string>('');
    const [isRestored, setIsRestored] = useState(false);

    // Hydrate state from URL or LocalStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // 1. Check URL
        const params = new URLSearchParams(window.location.search);
        const encoded = params.get('code');
        if (encoded) {
            const files = decompressFromUrl(encoded);
            if (files) {
                setState((prev) => ({ ...prev, files, activeFile: 'App.tsx' })); // eslint-disable-line react-hooks/set-state-in-effect
                setIsRestored(true);
                return;
            }
        }

        // 2. Check LocalStorage
        const session = loadSession();
        if (session) {
            setState((prev) => ({
                ...prev,
                files: session.files,
                activeFile: session.activeFile,
            }));
        }
        setIsRestored(true);
    }, []);

    // Auto-save to LocalStorage
    useEffect(() => {
        if (!isRestored) return; // Don't save before restoration to avoid overwriting with default

        const timer = setTimeout(() => {
            saveSession(state);
        }, 1000);

        return () => clearTimeout(timer);
    }, [state.files, state.activeFile, isRestored]); // eslint-disable-line react-hooks/exhaustive-deps

    // ... rest of the hook

    // (Existing functions: updateFile, addConsoleMessage etc.)
    const updateFile = useCallback((filename: string, content: string) => {
        setState((prev) => ({
            ...prev,
            files: {
                ...prev.files,
                [filename]: content,
            },
            dirtyFiles: prev.dirtyFiles.includes(filename) ? prev.dirtyFiles : [...prev.dirtyFiles, filename]
        }));
    }, []);

    const addConsoleMessage = useCallback((message: Omit<ConsoleMessage, 'id'>) => {
        setState((prev) => ({
            ...prev,
            consoleMessages: [
                ...prev.consoleMessages,
                {
                    ...message,
                    id: `${Date.now()}-${Math.random()}`,
                },
            ],
        }));
    }, []);

    const clearConsole = useCallback(() => {
        setState((prev) => ({
            ...prev,
            consoleMessages: [],
        }));
    }, []);

    const { isConnected, runOnLocal, sessionId } = useLocalRunner();

    const runCode = useCallback(async () => {
        setState((prev) => ({ ...prev, isRunning: true, error: null }));
        clearConsole();

        const code = state.files[state.activeFile] || '';

        addConsoleMessage({
            level: 'info',
            message: 'Running code...',
            timestamp: new Date(),
        });

        // Transform code
        const result = transformCode(code, state.activeFile);

        if (result.error) {
            setState((prev) => ({ ...prev, isRunning: false, error: result.error }));
            addConsoleMessage({
                level: 'error',
                message: `Compilation Error: ${result.error}`,
                timestamp: new Date(),
            });
            return;
        }

        const content = generateIframeContent(result.code, result.imports);
        setIframeContent(content);

        // Sync to Local Runner if connected
        if (isConnected) {
            try {
                // Normalize file names to match native workspace conventions.
                // The playground uses App.jsx; the native workspace expects App.tsx.
                const normalizedFiles: Record<string, string> = {};
                const FILE_NAME_MAP: Record<string, string> = {
                    'App.jsx': 'App.tsx',
                    'App.js': 'App.tsx',
                };
                for (const [name, content] of Object.entries(state.files)) {
                    normalizedFiles[FILE_NAME_MAP[name] ?? name] = content;
                }

                await runOnLocal(normalizedFiles);
                setState(prev => ({ ...prev, dirtyFiles: [] }));
                addConsoleMessage({
                    level: 'info',
                    message: 'Synced to Local Runner',
                    timestamp: new Date(),
                });
            } catch (err) {
                console.error('Failed to sync to local runner:', err);
            }
        }

        addConsoleMessage({
            level: 'info',
            message: 'Code compiled successfully',
            timestamp: new Date(),
        });

        setState((prev) => ({ ...prev, isRunning: false }));
    }, [state.files, state.activeFile, addConsoleMessage, clearConsole, isConnected, runOnLocal]);

    // Handle messages from iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'console') {
                addConsoleMessage({
                    level: event.data.level,
                    message: event.data.message,
                    timestamp: new Date(event.data.timestamp),
                });
            } else if (event.data?.type === 'ready') {
                addConsoleMessage({
                    level: 'info',
                    message: 'Preview ready',
                    timestamp: new Date(),
                });
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [addConsoleMessage]);

    const loadTemplate = useCallback((templateId: string) => {
        const template = getTemplate(templateId);

        if (!template) {
            addConsoleMessage({
                level: 'error',
                message: `Template "${templateId}" not found`,
                timestamp: new Date(),
            });
            return;
        }

        setState((prev) => ({
            ...prev,
            files: template.files,
            activeFile: 'App.jsx',
        }));

        setIframeContent(''); // Clear preview

        addConsoleMessage({
            level: 'info',
            message: `Loaded template: ${template.name}`,
            timestamp: new Date(),
        });
    }, [addConsoleMessage]);

    const selectFile = useCallback((filename: string) => {
        setState((prev) => {
            if (prev.files[filename] === undefined) return prev;

            const nextOpen = prev.openFiles.includes(filename) ? prev.openFiles : [...prev.openFiles, filename];
            return {
                ...prev,
                activeFile: filename,
                openFiles: nextOpen
            };
        });
    }, []);

    const closeFile = useCallback((filename: string) => {
        setState((prev) => {
            const nextOpen = prev.openFiles.filter(f => f !== filename);
            if (nextOpen.length === 0) return prev; // Keep at least one tab

            let nextActive = prev.activeFile;
            if (filename === prev.activeFile) {
                const currentIndex = prev.openFiles.indexOf(filename);
                nextActive = nextOpen[Math.min(currentIndex, nextOpen.length - 1)];
            }

            return {
                ...prev,
                openFiles: nextOpen,
                activeFile: nextActive
            };
        });
    }, []);

    const createFile = useCallback((path: string, content: string = '') => {
        setState((prev) => {
            if (prev.files[path] !== undefined) return prev;
            return {
                ...prev,
                files: { ...prev.files, [path]: content },
                openFiles: [...prev.openFiles, path],
                activeFile: path
            };
        });
    }, []);

    const deleteFile = useCallback((path: string) => {
        setState((prev) => {
            const newFiles = { ...prev.files };
            delete newFiles[path];

            // Fallback to App.jsx if we deleted the active file
            let nextActive = prev.activeFile;
            if (path === prev.activeFile) {
                nextActive = Object.keys(newFiles).includes('App.jsx') ? 'App.jsx' : Object.keys(newFiles)[0];
            }

            return {
                ...prev,
                files: newFiles,
                activeFile: nextActive
            };
        });
    }, []);

    const renameFile = useCallback((oldPath: string, newPath: string) => {
        setState((prev) => {
            if (prev.files[oldPath] === undefined || prev.files[newPath] !== undefined) return prev;

            const newFiles = { ...prev.files };
            const content = newFiles[oldPath];
            delete newFiles[oldPath];
            newFiles[newPath] = content;

            return {
                ...prev,
                files: newFiles,
                activeFile: prev.activeFile === oldPath ? newPath : prev.activeFile
            };
        });
    }, []);

    return {
        ...state,
        sessionId,
        iframeContent,
        updateFile,
        runCode,
        clearConsole,
        addConsoleMessage,
        loadTemplate,
        selectFile,
        createFile,
        deleteFile,
        renameFile,
        closeFile
    };
}
