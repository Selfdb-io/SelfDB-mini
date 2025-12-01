import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import Input from '../Input';
import type { SearchBarProps } from './types';

/**
 * Reusable search bar component with icon and clear button.
 */
export function SearchBar({
    placeholder = 'Search...',
    onSearchChange,
    onClear,
    disabled = false,
}: SearchBarProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClear = () => {
        if (inputRef.current) {
            inputRef.current.value = '';
        }
        onClear();
    };

    return (
        <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
                className="pl-10 pr-10 w-full"
                disabled={disabled}
            />
            <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                disabled={disabled}
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
