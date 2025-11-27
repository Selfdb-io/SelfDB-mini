import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    /** Additional description text below the select */
    hint?: string;
    /** Error state styling */
    error?: boolean;
    /** Container className for width control */
    containerClassName?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ className, containerClassName, hint, error, children, ...props }, ref) => {
        return (
            <div className={cn('w-full', containerClassName)}>
                <div className="relative w-full">
                    <select
                        ref={ref}
                        className={cn(
                            'w-full px-3 py-2 pr-9 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white',
                            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 focus:border-primary-500',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'appearance-none cursor-pointer overflow-hidden',
                            error && 'border-red-500 focus:ring-red-500',
                            className
                        )}
                        {...props}
                    >
                        {children}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400 pointer-events-none" />
                </div>
                {hint && (
                    <p className={cn('text-xs mt-1', error ? 'text-red-400' : 'text-gray-500 dark:text-slate-500')}>
                        {hint}
                    </p>
                )}
            </div>
        );
    }
);

Select.displayName = 'Select';

export default Select;
