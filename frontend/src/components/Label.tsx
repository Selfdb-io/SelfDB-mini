import React from 'react';
import { cn } from '../lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
    /** Mark the field as required */
    required?: boolean;
}

const Label: React.FC<LabelProps> = ({ className, children, required, ...props }) => {
    return (
        <label
            className={cn('block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1', className)}
            {...props}
        >
            {children}
            {required && <span className="text-red-400 ml-1">*</span>}
        </label>
    );
};

Label.displayName = 'Label';

export default Label;
