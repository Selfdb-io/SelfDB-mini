import React, { forwardRef } from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Additional description text below the input */
    hint?: string;
    /** Error state styling */
    error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, hint, error, type = 'text', ...props }, ref) => {
        return (
            <div className="w-full">
                <input
                    type={type}
                    ref={ref}
                    className={cn(
                        'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        error && 'border-red-500 focus:ring-red-500',
                        className
                    )}
                    {...props}
                />
                {hint && (
                    <p className={cn('text-xs mt-1', error ? 'text-red-400' : 'text-slate-500')}>
                        {hint}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

export default Input;
