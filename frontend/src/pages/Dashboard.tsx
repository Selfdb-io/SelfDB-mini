import { useEffect, useState } from 'react';
import { getUserCountUsersCountGet, getTableCountTablesCountGet } from '../client/sdk.gen';
import { API_KEY } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Users, Database, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const { token } = useAuth();
    const [userCount, setUserCount] = useState(0);
    const [tableCount, setTableCount] = useState(0);

    useEffect(() => {
        const fetchStats = async () => {
            if (!token) return;
            try {
                const usersResponse = await getUserCountUsersCountGet({ 
                    headers: { 
                        'X-API-Key': API_KEY,
                        Authorization: `Bearer ${token}`,
                    } 
                });
                if (usersResponse.data !== undefined) setUserCount(usersResponse.data);

                const tablesResponse = await getTableCountTablesCountGet({ 
                    headers: { 
                        'X-API-Key': API_KEY,
                        Authorization: `Bearer ${token}`,
                    } 
                });
                if (tablesResponse.data !== undefined) setTableCount(tablesResponse.data);
            } catch (error) {
                console.error('Failed to fetch stats', error);
            }
        };
        fetchStats();
    }, [token]);

    const stats = [
        { name: 'Total Users', value: userCount, icon: Users, href: '/users', color: 'bg-blue-500' },
        { name: 'Total Tables', value: tableCount, icon: Database, href: '/tables', color: 'bg-primary-500' },
    ];

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Dashboard Overview</h1>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {stats.map((item) => (
                    <div
                        key={item.name}
                        className="relative overflow-hidden rounded-lg bg-white dark:bg-slate-800 px-4 pb-12 pt-5 shadow sm:px-6 sm:pt-6 border border-gray-200 dark:border-slate-700"
                    >
                        <dt>
                            <div className={`absolute rounded-md ${item.color} p-3`}>
                                <item.icon className="h-6 w-6 text-white" aria-hidden="true" />
                            </div>
                            <p className="ml-16 truncate text-sm font-medium text-gray-500 dark:text-slate-400">{item.name}</p>
                        </dt>
                        <dd className="ml-16 flex items-baseline pb-1 sm:pb-7">
                            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{item.value}</p>
                        </dd>
                        <div className="absolute inset-x-0 bottom-0 bg-gray-50 dark:bg-slate-800/50 px-4 py-4 sm:px-6 border-t border-gray-200 dark:border-slate-700">
                            <div className="text-sm">
                                <Link to={item.href} className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 flex items-center gap-1">
                                    View all <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Link
                        to="/users"
                        className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <div className="rounded-full bg-blue-500/10 p-3 text-blue-600 dark:text-blue-400">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">Manage Users</h3>
                            <p className="text-sm text-gray-500 dark:text-slate-400">Add, edit, or remove users</p>
                        </div>
                    </Link>
                    <Link
                        to="/tables"
                        className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <div className="rounded-full bg-primary-500/10 p-3 text-primary-600 dark:text-primary-400">
                            <Database className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900 dark:text-white">Manage Tables</h3>
                            <p className="text-sm text-gray-500 dark:text-slate-400">Create tables and manage data</p>
                        </div>
                    </Link>
                </div>
            </div>
        </div>
    );
}
