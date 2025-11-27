import { useState, useRef } from 'react';
import { Upload, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { ConfirmationModal } from './index';
import { API_KEY } from '../lib/api';

interface RestoreBackupProps {
    onRestoreComplete: () => void;
}

type RestoreStatus = 'idle' | 'uploading' | 'restoring' | 'success' | 'error';

export default function RestoreBackup({ onRestoreComplete }: RestoreBackupProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [status, setStatus] = useState<RestoreStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [errorMessage, setErrorMessage] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (!file.name.endsWith('.tar.gz')) {
                setErrorMessage('Please select a valid backup file (.tar.gz)');
                setSelectedFile(null);
                return;
            }
            setSelectedFile(file);
            setErrorMessage('');
            setStatus('idle');
        }
    };

    const handleChooseFile = () => {
        fileInputRef.current?.click();
    };

    const handleRestore = () => {
        if (!selectedFile) return;
        setShowConfirmModal(true);
    };

    const performRestore = async () => {
        if (!selectedFile) return;

        setStatus('uploading');
        setProgress(0);
        setErrorMessage('');

        const baseUrl = import.meta.env.DEV ? 'http://localhost:8000' : '/api';

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 200);

            const response = await fetch(`${baseUrl}/backups/restore`, {
                method: 'POST',
                headers: {
                    'X-API-Key': API_KEY,
                },
                body: formData,
            });

            clearInterval(progressInterval);

            if (!response.ok) {
                // Try to parse JSON error, but handle non-JSON responses gracefully
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Restore failed');
                } else {
                    throw new Error(`Server error (${response.status}): ${response.statusText}`);
                }
            }

            setProgress(100);
            setStatus('success');

            // Wait a moment then notify parent
            setTimeout(() => {
                onRestoreComplete();
            }, 2000);

        } catch (error) {
            setStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
        }
    };

    const resetState = () => {
        setSelectedFile(null);
        setStatus('idle');
        setProgress(0);
        setErrorMessage('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="mt-6 border-t border-gray-200 dark:border-slate-700 pt-6">
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-5 w-5 text-primary-500" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                        Restore from Backup
                    </h3>
                </div>

                <p className="text-xs text-gray-600 dark:text-slate-400 mb-3">
                    Migrating from another server? Upload your backup file to restore all data.
                </p>

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".tar.gz"
                    className="hidden"
                />

                {status === 'idle' && (
                    <>
                        <div
                            onClick={handleChooseFile}
                            className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-500 dark:hover:border-primary-500 transition-colors"
                        >
                            <Upload className="h-6 w-6 mx-auto text-gray-400 dark:text-slate-500 mb-1" />
                            <p className="text-xs text-gray-600 dark:text-slate-400">
                                {selectedFile ? (
                                    <span className="text-primary-600 dark:text-primary-400 font-medium">
                                        {selectedFile.name}
                                        <span className="text-gray-500 dark:text-slate-500 ml-1">
                                            ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                        </span>
                                    </span>
                                ) : (
                                    <span className="text-primary-600 dark:text-primary-400 font-medium">
                                        Click to choose backup file
                                    </span>
                                )}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                                .tar.gz files only
                            </p>
                        </div>

                        {selectedFile && (
                            <button
                                onClick={handleRestore}
                                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-500 transition-colors"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Restore Backup
                            </button>
                        )}
                    </>
                )}

                {(status === 'uploading' || status === 'restoring') && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-primary-500 animate-spin" />
                            <span className="text-xs text-gray-600 dark:text-slate-400">
                                {status === 'uploading' ? 'Uploading...' : 'Restoring...'}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-slate-500 ml-auto">
                                {progress}%
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                            <div
                                className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <p className="text-xs font-medium text-green-800 dark:text-green-300">
                            Restore complete! Redirecting...
                        </p>
                    </div>
                )}

                {status === 'error' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                            <p className="text-xs text-red-800 dark:text-red-300">
                                {errorMessage || 'Restore failed'}
                            </p>
                        </div>
                        <button
                            onClick={resetState}
                            className="w-full px-3 py-1.5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-white text-xs rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {errorMessage && status === 'idle' && (
                    <div className="mt-2 flex items-center gap-1 text-red-600 dark:text-red-400 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        {errorMessage}
                    </div>
                )}

                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    This option disappears after first user login
                </p>
            </div>

            <ConfirmationModal
                isOpen={showConfirmModal}
                onClose={() => setShowConfirmModal(false)}
                onConfirm={performRestore}
                title="Confirm Restore"
                message="This will replace all existing data with the backup contents. Are you sure you want to continue?"
                confirmText="Restore"
                isDangerous
            />
        </div>
    );
}
