import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import type { TableHeaderProps } from './types';

/**
 * Reusable table header with title, back navigation, and action buttons.
 */
export function TableHeader({
    title,
    backTo,
    onRefresh,
    onCreateClick,
    createButtonLabel = 'Create',
    isLoading = false,
    additionalActions,
}: TableHeaderProps) {
    const navigate = useNavigate();

    return (
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
                {backTo && (
                    <button
                        onClick={() => navigate(backTo.path)}
                        className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title={backTo.label || 'Back'}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
            </div>

            <div className="flex items-center gap-3">
                {additionalActions}
                
                <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                </button>

                {onCreateClick && (
                    <button
                        onClick={onCreateClick}
                        className="flex items-center gap-2 px-4 py-2 text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        <span>{createButtonLabel}</span>
                    </button>
                )}
            </div>
        </div>
    );
}
