import React, { forwardRef } from 'react';
import { cn } from '../lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Label text for the checkbox */
    label?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, label, id, ...props }, ref) => {
        const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

        return (
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id={checkboxId}
                    ref={ref}
                    className={cn(
                        'w-4 h-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-primary-600',
                        'focus:ring-2 focus:ring-primary-500 focus:ring-offset-0',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        className
                    )}
                    {...props}
                />
                {label && (
                    <label
                        htmlFor={checkboxId}
                        className="text-sm font-medium text-gray-700 dark:text-slate-300 cursor-pointer select-none"
                    >
                        {label}
                    </label>
                )}
            </div>
        );
    }
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
