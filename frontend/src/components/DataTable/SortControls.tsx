import { ArrowUpDown } from 'lucide-react';
import Select from '../Select';
import type { SortControlsProps } from './types';

/**
 * Reusable sort controls with dropdown and direction toggle.
 */
export function SortControls({
    sortOptions,
    sortBy,
    sortOrder,
    onSortByChange,
    onToggleSortOrder,
    disabled = false,
}: SortControlsProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-slate-400 whitespace-nowrap">Sort by:</span>
            <Select
                value={sortBy || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSortByChange(e.target.value || null)}
                className="min-w-[140px]"
                disabled={disabled}
            >
                {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </Select>
            <button
                onClick={onToggleSortOrder}
                className="flex items-center gap-1 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                disabled={disabled}
                title={`Sort ${sortOrder === 'desc' ? 'Descending' : 'Ascending'}`}
            >
                <ArrowUpDown className="h-4 w-4" />
                <span>{sortOrder === 'desc' ? 'Desc' : 'Asc'}</span>
            </button>
        </div>
    );
}
