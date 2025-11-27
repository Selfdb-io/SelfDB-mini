import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

// App metadata from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Day One';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '';

interface HeaderProps {
    showThemeToggle?: boolean;
}

export default function Header({ showThemeToggle = true }: HeaderProps) {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="w-full bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
            <div className="flex justify-between items-center h-16 px-4">
                <Link to="/" className="flex items-center">
                    {/* Logo */}
                    <img 
                        src="/logo.svg" 
                        alt={`${APP_NAME} Logo`} 
                        className="h-8 w-8 dark:brightness-0 dark:invert" 
                    />
                    
                    {/* App Name */}
                    <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">
                        {APP_NAME}
                    </span>
                    
                    {/* Version Badge */}
                    {APP_VERSION && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-full">
                            v{APP_VERSION}
                        </span>
                    )}
                </Link>

                {/* Right side actions */}
                <div className="flex items-center gap-2">
                    {showThemeToggle && (
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {theme === 'dark' ? (
                                <Sun className="h-5 w-5" />
                            ) : (
                                <Moon className="h-5 w-5" />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
