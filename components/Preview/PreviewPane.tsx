'use client';

import { Smartphone, Monitor, Loader2, Wifi, WifiOff, Play, Terminal, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocalRunner } from '@/lib/state/useLocalRunner';
import Link from 'next/link';

interface PreviewPaneProps {
    iframeContent: string;
}

type SystemState = 'disconnected' | 'connected' | 'running';
type PreviewMode = 'simulator' | 'web';

export default function PreviewPane({ iframeContent }: PreviewPaneProps) {
    const { status, pairingRequired, runnerRestarted, pair, isConnected, token } = useLocalRunner();
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [inputToken, setInputToken] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('web'); // Default to web
    const [isPolling, setIsPolling] = useState(false);

    const RUNNER_URL = 'http://127.0.0.1:3001';

    // Determine system state
    let systemState: SystemState = 'disconnected';
    if (isConnected && !pairingRequired && (isPolling || imageUrl)) {
        systemState = 'running';
    } else if (isConnected && !pairingRequired) {
        systemState = 'connected';
    }

    // Screenshot polling when connected (for iOS Simulator mode)
    useEffect(() => {
        if (!isConnected || pairingRequired || !token || previewMode !== 'simulator') {
            setIsPolling(false);
            return;
        }

        let timeoutId: ReturnType<typeof setTimeout>;
        let isMounted = true;
        setIsPolling(true);

        const fetchScreenshot = async () => {
            try {
                const res = await fetch(`${RUNNER_URL}/screenshot?t=${Date.now()}`, {
                    headers: { 'X-Runner-Token': token }
                });
                if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);

                    if (isMounted) {
                        setImageUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return url;
                        });
                        timeoutId = setTimeout(fetchScreenshot, 1000);
                    }
                } else {
                    if (isMounted) timeoutId = setTimeout(fetchScreenshot, 2000);
                }
            } catch {
                if (isMounted) timeoutId = setTimeout(fetchScreenshot, 5000);
            }
        };

        fetchScreenshot();

        return () => {
            isMounted = false;
            setIsPolling(false);
            clearTimeout(timeoutId);
        };
    }, [isConnected, pairingRequired, token, previewMode]);

    const handlePair = async () => {
        if (!inputToken.trim()) return;
        setIsLoading(true);
        await pair(inputToken.trim());
        setIsLoading(false);
        setInputToken('');
    };

    // Simulator name from status
    const simulatorName = status.simulators?.[0] || 'iOS Simulator';

    return (
        <div className="flex h-full flex-col" style={{ background: 'var(--surface)' }}>
            {/* Header with Mode Toggle */}
            <div
                className="flex h-12 flex-none items-center justify-between border-b px-4"
                style={{ borderColor: 'var(--border)' }}
            >
                {/* Mode Toggle */}
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg p-0.5" style={{ background: 'var(--background)' }}>
                        <button
                            onClick={() => setPreviewMode('simulator')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${previewMode === 'simulator'
                                ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-800 dark:text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                        >
                            <Smartphone className="h-3.5 w-3.5" />
                            iOS Simulator
                        </button>
                        <button
                            onClick={() => setPreviewMode('web')}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${previewMode === 'web'
                                ? 'bg-white shadow-sm text-gray-900 dark:bg-gray-800 dark:text-white'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                        >
                            <Monitor className="h-3.5 w-3.5" />
                            Web Preview
                        </button>
                    </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                    {previewMode === 'simulator' && (
                        <>
                            <span className={`status-dot status-dot--${systemState}`} />
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {systemState === 'running' && 'Running'}
                                {systemState === 'connected' && 'Ready'}
                                {systemState === 'disconnected' && 'Disconnected'}
                            </span>
                        </>
                    )}
                    {previewMode === 'web' && (
                        <span className="text-[10px] text-amber-500 uppercase tracking-wider font-medium">
                            Best Effort
                        </span>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {/* Web Preview - uses iframeContent from bundler */}
                {previewMode === 'web' && (
                    <WebPreview iframeContent={iframeContent} />
                )}

                {/* iOS Simulator requires runner connection */}
                {previewMode === 'simulator' && (
                    <>
                        {systemState === 'disconnected' && (
                            <DisconnectedState
                                pairingRequired={pairingRequired}
                                runnerRestarted={runnerRestarted}
                                inputToken={inputToken}
                                setInputToken={setInputToken}
                                onPair={handlePair}
                                isLoading={isLoading}
                            />
                        )}

                        {systemState === 'connected' && (
                            <ConnectedState simulatorName={simulatorName} />
                        )}

                        {systemState === 'running' && (
                            <SimulatorPreview imageUrl={imageUrl} simulatorName={simulatorName} />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ============================================
// EMPTY STATES
// ============================================

function DisconnectedState({
    pairingRequired,
    runnerRestarted,
    inputToken,
    setInputToken,
    onPair,
    isLoading
}: {
    pairingRequired: boolean;
    runnerRestarted: boolean;
    inputToken: string;
    setInputToken: (v: string) => void;
    onPair: () => void;
    isLoading: boolean;
}) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
            <div className="w-full max-w-sm">
                <div className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: runnerRestarted ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                    <WifiOff className="h-8 w-8" style={{ color: runnerRestarted ? 'var(--status-connected)' : 'var(--status-disconnected)' }} />
                </div>

                <h3 className="text-title text-gray-900 dark:text-white mb-2">
                    {runnerRestarted ? 'Runner Restarted' : 'Connect Your Local Runner'}
                </h3>

                <p className="text-caption mb-6">
                    {runnerRestarted
                        ? 'The runner was restarted. Please paste the new token to reconnect.'
                        : 'Start the runner on your Mac to preview on iOS Simulator.'
                    }
                </p>

                {pairingRequired ? (
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onPair()}
                            placeholder="Paste runner token here"
                            className="input text-center"
                        />
                        <button
                            onClick={onPair}
                            disabled={!inputToken.trim() || isLoading}
                            className="btn btn--primary w-full"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <Terminal className="h-4 w-4 text-gray-500" />
                                <span className="text-xs font-medium text-gray-500">In your terminal</span>
                            </div>
                            <code className="text-mono text-sm text-green-600 dark:text-green-400">
                                npx sim-bridge
                            </code>
                        </div>

                        <div className="flex items-center justify-center gap-1 text-xs text-gray-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Waiting for runner on port 3001...</span>
                        </div>

                        <Link href="/get-started" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            Need help getting started?
                            <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}

function ConnectedState({ simulatorName }: { simulatorName: string }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
            <div className="w-full max-w-sm">
                <div className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                    <Wifi className="h-8 w-8" style={{ color: 'var(--status-connected)' }} />
                </div>

                <h3 className="text-title text-gray-900 dark:text-white mb-2">
                    Ready to Run
                </h3>

                <p className="text-caption mb-6">
                    Connected to {simulatorName}. Click Run to launch your app.
                </p>

                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Play className="h-4 w-4" />
                    <span>Press Run in the top bar</span>
                </div>
            </div>
        </div>
    );
}

// ============================================
// PREVIEW MODES
// ============================================

function SimulatorPreview({ imageUrl, simulatorName }: { imageUrl: string | null; simulatorName: string }) {
    return (
        <div className="relative h-full w-full" style={{ background: '#000' }}>
            {/* Status Bar */}
            <div className="absolute left-0 top-0 z-10 flex w-full items-center justify-between px-3 py-2" style={{ background: 'rgba(0,0,0,0.7)' }}>
                <div className="flex items-center gap-2">
                    <span className="status-dot status-dot--running" />
                    <span className="text-xs font-medium text-white">Running on {simulatorName}</span>
                </div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">View Only</span>
            </div>

            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt="Simulator Mirror"
                    className="h-full w-full object-contain select-none"
                    style={{ pointerEvents: 'none' }}
                    draggable={false}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                </div>
            )}
        </div>
    );
}

function WebPreview({ iframeContent }: { iframeContent: string }) {
    if (!iframeContent) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
                <div className="w-full max-w-sm">
                    <div className="mx-auto mb-6 w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                        <Monitor className="h-8 w-8 text-blue-500" />
                    </div>

                    <h3 className="text-title text-gray-900 dark:text-white mb-2">
                        Ready to Preview
                    </h3>

                    <p className="text-caption mb-6">
                        Click Run to compile and preview your React Native code in the browser.
                    </p>

                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                        <Play className="h-4 w-4" />
                        <span>Press Run in the top bar</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full w-full">
            <iframe
                srcDoc={iframeContent}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="Web Preview"
            />
        </div>
    );
}
