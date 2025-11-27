import { useState, useEffect } from 'react';
import { Download, Trash2, Plus, RefreshCw, Archive, AlertTriangle, Clock, HardDrive } from 'lucide-react';
import { ConfirmationModal } from '../components';
import { API_KEY } from '../lib/api';

interface BackupInfo {
    filename: string;
    size: number;
    created_at: string;
}

export default function Backups() {
    const [backups, setBackups] = useState<BackupInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    const baseUrl = import.meta.env.DEV ? 'http://localhost:8000' : '/api';

    const fetchBackups = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseUrl}/backups`, {
                headers: {
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch backups');
            }
            
            const data = await response.json();
            setBackups(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load backups');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const handleCreateBackup = async () => {
        setCreating(true);
        setError('');
        setSuccess('');
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseUrl}/backups`, {
                method: 'POST',
                headers: {
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to create backup');
            }
            
            const result = await response.json();
            setSuccess(result.message);
            // Refresh without showing loading spinner to avoid UI flash
            await fetchBackups(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create backup');
        } finally {
            setCreating(false);
        }
    };

    const handleDownload = async (filename: string) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseUrl}/backups/${filename}/download`, {
                headers: {
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                throw new Error('Failed to download backup');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download backup');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${baseUrl}/backups/${deleteTarget}`, {
                method: 'DELETE',
                headers: {
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${token}`,
                },
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete backup');
            }
            
            setSuccess(`Backup ${deleteTarget} deleted successfully`);
            await fetchBackups(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete backup');
        } finally {
            setDeleteTarget(null);
        }
    };

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backups</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        Manage database backups and configuration snapshots
                    </p>
                </div>
                <button
                    onClick={handleCreateBackup}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {creating ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        <Plus className="h-4 w-4" />
                    )}
                    {creating ? 'Creating...' : 'Create Backup'}
                </button>
            </div>

            {/* Schedule Info */}
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                            Automatic Backups Enabled
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                            Scheduled daily at 2:00 AM • Keeps last 7 days
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    <button
                        onClick={() => setError('')}
                        className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                    >
                        ×
                    </button>
                </div>
            )}

            {success && (
                <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                    <Archive className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
                    <button
                        onClick={() => setSuccess('')}
                        className="ml-auto text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Backups List */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
                    </div>
                ) : backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-slate-400">
                        <Archive className="h-12 w-12 mb-4 opacity-50" />
                        <p className="text-sm">No backups available</p>
                        <p className="text-xs mt-1">Create your first backup to get started</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-slate-700">
                        {backups.map((backup) => (
                            <div
                                key={backup.filename}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-primary-100 dark:bg-primary-500/20 rounded-lg">
                                        <Archive className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {backup.filename}
                                        </p>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                                                <HardDrive className="h-3 w-3" />
                                                {formatSize(backup.size)}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                                                <Clock className="h-3 w-3" />
                                                {formatDate(backup.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownload(backup.filename)}
                                        className="p-2 text-gray-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-colors"
                                        title="Download backup"
                                    >
                                        <Download className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteTarget(backup.filename)}
                                        className="p-2 text-gray-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete backup"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Backup"
                message={`Are you sure you want to delete "${deleteTarget}"? This action cannot be undone.`}
                confirmText="Delete"
                isDangerous
            />
        </div>
    );
}
