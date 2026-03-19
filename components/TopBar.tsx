'use client';

import { Play, RotateCw, Share2, Check, Terminal, Loader2, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useLocalRunner } from '@/lib/state/useLocalRunner';

type SystemState = 'disconnected' | 'connected' | 'running';

interface TopBarProps {
    onRun: () => void;
    onShare: () => void;
    isRunning: boolean;
    copied: boolean;
    onToggleTemplates: () => void;
}

function StatusIndicator({ state }: { state: SystemState }) {
    const config = {
        disconnected: {
            dot: 'status-dot--disconnected',
            label: 'Disconnected',
            sublabel: 'Start the local runner to connect'
        },
        connected: {
            dot: 'status-dot--connected',
            label: 'Connected',
            sublabel: 'Ready to run'
        },
        running: {
            dot: 'status-dot--running',
            label: 'Running',
            sublabel: 'App is live on simulator'
        }
    };

    const { dot, label, sublabel } = config[state];

    return (
        <div className="flex items-center gap-3">
            <span className={`status-dot ${dot}`} />
            <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {sublabel}
                </span>
            </div>
        </div>
    );
}

function TokenInput() {
    const { pair, pairingRequired } = useLocalRunner();
    const [tokenValue, setTokenValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    if (!pairingRequired) return null;

    const handleSubmit = async () => {
        if (!tokenValue.trim()) return;
        setIsSubmitting(true);
        setErrorMsg('');
        const result = await pair(tokenValue.trim());
        setIsSubmitting(false);
        if (result.success) {
            setTokenValue('');
        } else {
            setErrorMsg(result.error ?? 'Failed to connect. Is sim-bridge running?');
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={tokenValue}
                    onChange={(e) => { setTokenValue(e.target.value); setErrorMsg(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Paste runner token"
                    className={`input w-48 text-sm ${errorMsg ? 'border-red-400 focus:border-red-500' : ''}`}
                />
                <button
                    onClick={handleSubmit}
                    disabled={!tokenValue.trim() || isSubmitting}
                    className="btn btn--secondary text-sm px-3 py-2"
                >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                </button>
            </div>
            {errorMsg && (
                <p className="text-xs text-red-500 max-w-48 text-right">{errorMsg}</p>
            )}
        </div>
    );
}

export default function TopBar({
    onRun,
    onShare,
    isRunning,
    copied,
    onToggleTemplates
}: TopBarProps) {
    const { isConnected } = useLocalRunner();

    // Derive system state
    let systemState: SystemState = 'disconnected';
    if (isConnected && isRunning) {
        systemState = 'running';
    } else if (isConnected) {
        systemState = 'connected';
    }

    const runButtonText = isRunning ? 'Running...' : (systemState === 'running' ? 'Restart' : 'Run');
    const RunIcon = systemState === 'running' ? RotateCw : Play;

    return (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 dark:bg-gray-900" style={{ borderColor: 'var(--border)' }}>
            {/* Left: Logo + Badge */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Terminal className="h-5 w-5 text-blue-600" />
                    <h1 className="text-base font-semibold text-gray-900 dark:text-white">
                        Playground
                    </h1>
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    Local Runner
                </span>
            </div>

            {/* Center: Status Indicator */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
                <StatusIndicator state={systemState} />
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
                {/* Token Input (when disconnected) */}
                {systemState === 'disconnected' && <TokenInput />}

                {/* Templates Dropdown */}
                <button
                    onClick={onToggleTemplates}
                    className="btn btn--ghost text-sm px-3 py-2"
                >
                    Templates
                    <ChevronDown className="h-4 w-4" />
                </button>

                {/* Share */}
                <button
                    onClick={onShare}
                    className="btn btn--secondary text-sm px-3 py-2"
                    title="Copy sharable URL"
                >
                    {copied ? (
                        <>
                            <Check className="h-4 w-4 text-green-500" />
                            Copied
                        </>
                    ) : (
                        <>
                            <Share2 className="h-4 w-4" />
                            Share
                        </>
                    )}
                </button>

                {/* Run Button */}
                <button
                    onClick={onRun}
                    disabled={isRunning}
                    className="btn btn--primary text-sm"
                >
                    <RunIcon className="h-4 w-4" />
                    {runButtonText}
                </button>
            </div>
        </header>
    );
}
