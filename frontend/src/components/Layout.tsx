import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LayoutDashboard, Users, Database, LogOut, Sun, Moon, Archive } from 'lucide-react';

// App metadata from environment variables
const APP_NAME = import.meta.env.VITE_APP_NAME || 'Day One';
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '';

export default function Layout() {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();

    const navigation = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Users', href: '/users', icon: Users },
        { name: 'Tables', href: '/tables', icon: Database },
        { name: 'Backups', href: '/backups', icon: Archive, adminOnly: true },
    ];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex transition-colors duration-300">
            {/* Sidebar - Minimal by default, expands on hover */}
            <div className="group/sidebar fixed inset-y-0 z-50 flex w-16 hover:w-72 flex-col transition-all duration-300 ease-in-out">
                <div className="flex grow flex-col gap-y-5 overflow-y-auto overflow-x-hidden border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 group-hover/sidebar:px-6 pb-4 transition-all duration-300">
                    <div className="flex h-16 shrink-0 items-center justify-center group-hover/sidebar:justify-start gap-3">
                        {/* Logo */}
                        <img 
                            src="/logo.svg" 
                            alt={`${APP_NAME} Logo`} 
                            className="h-8 w-8 shrink-0 dark:brightness-0 dark:invert" 
                        />
                        
                        {/* App Name & Version - visible on hover */}
                        <div className="hidden group-hover/sidebar:flex items-center gap-2 overflow-hidden">
                            <span className="text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">
                                {APP_NAME}
                            </span>
                            {APP_VERSION && (
                                <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-full whitespace-nowrap">
                                    v{APP_VERSION}
                                </span>
                            )}
                        </div>
                    </div>
                    <nav className="flex flex-1 flex-col">
                        <ul role="list" className="flex flex-1 flex-col gap-y-7">
                            <li>
                                <ul role="list" className="-mx-2 space-y-1">
                                    {navigation
                                        .filter((item) => !item.adminOnly || user?.role === 'ADMIN')
                                        .map((item) => {
                                        const isActive = location.pathname === item.href;
                                        return (
                                            <li key={item.name}>
                                                <Link
                                                    to={item.href}
                                                    title={item.name}
                                                    className={`
                                                        group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold items-center justify-center group-hover/sidebar:justify-start transition-colors
                                                        ${isActive
                                                            ? 'bg-gray-100 dark:bg-slate-800 text-primary-600 dark:text-white'
                                                            : 'text-gray-700 dark:text-slate-400 hover:text-primary-600 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
                                                        }
                                                    `}
                                                >
                                                    <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                                                    <span className="hidden group-hover/sidebar:inline whitespace-nowrap overflow-hidden">{item.name}</span>
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                            <li className="mt-auto space-y-2">
                                <button
                                    onClick={toggleTheme}
                                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                                    className="w-full group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold text-gray-700 dark:text-slate-400 hover:text-primary-600 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 items-center justify-center group-hover/sidebar:justify-start transition-colors"
                                >
                                    {theme === 'dark' ? (
                                        <Sun className="h-6 w-6 shrink-0" aria-hidden="true" />
                                    ) : (
                                        <Moon className="h-6 w-6 shrink-0" aria-hidden="true" />
                                    )}
                                    <span className="hidden group-hover/sidebar:inline whitespace-nowrap overflow-hidden">
                                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                                    </span>
                                </button>

                                <Link
                                    to="/profile"
                                    className="flex items-center gap-x-4 py-3 text-sm font-semibold leading-6 text-gray-700 dark:text-slate-400 justify-center group-hover/sidebar:justify-start hover:text-primary-600 dark:hover:text-white transition-colors rounded-md p-2 hover:bg-gray-50 dark:hover:bg-slate-800"
                                    title="Profile Settings"
                                >
                                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                        <span className="text-gray-900 dark:text-white">{user?.firstName?.[0]}</span>
                                    </div>
                                    <span className="sr-only">Your profile</span>
                                    <span aria-hidden="true" className="hidden group-hover/sidebar:inline whitespace-nowrap overflow-hidden">{user?.firstName} {user?.lastName}</span>
                                </Link>
                                <button
                                    onClick={logout}
                                    title="Sign out"
                                    className="w-full group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold text-gray-700 dark:text-slate-400 hover:text-primary-600 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800 items-center justify-center group-hover/sidebar:justify-start transition-colors"
                                >
                                    <LogOut className="h-6 w-6 shrink-0" aria-hidden="true" />
                                    <span className="hidden group-hover/sidebar:inline whitespace-nowrap overflow-hidden">Sign out</span>
                                </button>
                            </li>
                        </ul>
                    </nav>
                </div>
            </div>

            {/* Main content - adjusted left padding for minimal sidebar */}
            <div className="pl-16 w-full transition-all duration-300">
                <main className="py-10">
                    <div className="px-4 sm:px-6 lg:px-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
