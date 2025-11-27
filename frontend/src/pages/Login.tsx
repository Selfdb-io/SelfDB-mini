import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Input, Label, RestoreBackup, Header } from '../components';
import { API_KEY } from '../lib/api';

interface SystemStatus {
    initialized: boolean;
    version: string;
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [restoreMessage, setRestoreMessage] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || '/';

    // Check system status on mount
    useEffect(() => {
        const checkSystemStatus = async () => {
            try {
                // Use relative URL for production, absolute for dev
                const baseUrl = import.meta.env.DEV ? 'http://localhost:8000' : '/api';
                const response = await fetch(`${baseUrl}/system/status`, {
                    headers: {
                        'X-API-Key': API_KEY,
                    },
                });
                if (response.ok) {
                    const data = await response.json();
                    setSystemStatus(data);
                }
            } catch (err) {
                console.error('Failed to check system status:', err);
            } finally {
                setStatusLoading(false);
            }
        };

        checkSystemStatus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login({ email, password });
            navigate(from, { replace: true });
        } catch (err) {
            setError('Invalid email or password');
        }
    };

    const handleRestoreComplete = () => {
        setRestoreMessage('Restore complete! Please login with your restored credentials.');
        // Refresh system status
        setSystemStatus({ initialized: true, version: systemStatus?.version || '1.0.0' });
    };

    const showRestoreOption = !statusLoading && systemStatus && !systemStatus.initialized;

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
            <Header />
            
            <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8">
                <div className="sm:mx-auto sm:w-full sm:max-w-sm">
                    <h2 className="text-center text-2xl font-bold leading-9 tracking-tight text-gray-900 dark:text-white">
                        Sign in to your account
                    </h2>
                </div>

                <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
                {restoreMessage && (
                    <div className="mb-6 p-4 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg">
                        <p className="text-sm text-green-700 dark:text-green-300">{restoreMessage}</p>
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <Label htmlFor="email">Email address</Label>
                        <div className="mt-2">
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="password">Password</Label>
                        <div className="mt-2">
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="flex w-full justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 transition-colors"
                        >
                            Sign in
                        </button>
                    </div>
                </form>

                {showRestoreOption && (
                    <RestoreBackup onRestoreComplete={handleRestoreComplete} />
                )}
                </div>
            </div>
        </div>
    );
}
