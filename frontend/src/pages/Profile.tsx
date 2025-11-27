import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateUserUsersUserIdPatch } from '../client/sdk.gen';
import { API_KEY } from '../lib/api';
import { User, Mail, Shield, Calendar, Save, RefreshCw, Lock } from 'lucide-react';
import { Input, Label } from '../components';

export default function Profile() {
    const { user, token, refreshUser } = useAuth();
    const [saving, setSaving] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [success, setSuccess] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [error, setError] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
    });

    const [passwordForm, setPasswordForm] = useState({
        newPassword: '',
        confirmPassword: '',
    });

    useEffect(() => {
        if (user) {
            setForm({
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                email: user.email || '',
            });
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !token) return;

        setSaving(true);
        setError('');
        setSuccess(false);

        try {
            await updateUserUsersUserIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: user.id,
                },
                body: {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    email: form.email,
                },
            });

            setSuccess(true);
            if (refreshUser) {
                await refreshUser();
            }
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to update profile:', err);
            setError(err?.detail || 'Failed to update profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !token) return;

        // Validate passwords
        if (passwordForm.newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters long.');
            return;
        }

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('Passwords do not match.');
            return;
        }

        setSavingPassword(true);
        setPasswordError('');
        setPasswordSuccess(false);

        try {
            await updateUserUsersUserIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: user.id,
                },
                body: {
                    password: passwordForm.newPassword,
                },
            });

            setPasswordSuccess(true);
            setPasswordForm({ newPassword: '', confirmPassword: '' });
            setTimeout(() => setPasswordSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to change password:', err);
            setPasswordError(err?.detail || 'Failed to change password. Please try again.');
        } finally {
            setSavingPassword(false);
        }
    };

    const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return '—';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (!user) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 text-primary-600 dark:text-primary-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Profile Settings</h1>

            {/* Profile Header Card */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 mb-6">
                <div className="flex items-center gap-6">
                    <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-3xl font-bold text-white">
                        {user.firstName?.[0]}{user.lastName?.[0]}
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                            {user.firstName} {user.lastName}
                        </h2>
                        <p className="text-gray-500 dark:text-slate-400">{user.email}</p>
                        <div className="flex items-center gap-4 mt-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                user.role === 'ADMIN' 
                                    ? 'bg-primary-100 dark:bg-primary-500/10 text-primary-700 dark:text-primary-400' 
                                    : 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                            }`}>
                                <Shield className="h-3 w-3" />
                                {user.role}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                user.isActive 
                                    ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' 
                                    : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                            }`}>
                                {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Edit Profile Form */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <User className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                            Edit Profile
                        </h3>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-700 dark:text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
                                Profile updated successfully!
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="firstName">First Name</Label>
                                    <Input
                                        id="firstName"
                                        type="text"
                                        value={form.firstName}
                                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="lastName">Last Name</Label>
                                    <Input
                                        id="lastName"
                                        type="text"
                                        value={form.lastName}
                                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4" />
                                    )}
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Change Password Section */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 mt-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Lock className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                            Change Password
                        </h3>

                        {passwordError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-red-700 dark:text-red-400 text-sm">
                                {passwordError}
                            </div>
                        )}

                        {passwordSuccess && (
                            <div className="mb-4 p-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
                                Password changed successfully!
                            </div>
                        )}

                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div>
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    placeholder="Enter new password"
                                    required
                                    minLength={6}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-slate-500">
                                    Password must be at least 6 characters long
                                </p>
                            </div>

                            <div>
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    placeholder="Confirm new password"
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={savingPassword}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {savingPassword ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Lock className="h-4 w-4" />
                                    )}
                                    {savingPassword ? 'Changing...' : 'Change Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Account Info */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Info</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1">User ID</p>
                                <p className="text-sm text-gray-900 dark:text-white font-mono break-all">{user.id}</p>
                            </div>
                            
                            <div>
                                <p className="text-xs text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Member Since
                                </p>
                                <p className="text-sm text-gray-900 dark:text-white">{formatDate(user.created_at)}</p>
                            </div>

                            <div>
                                <p className="text-xs text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Shield className="h-3 w-3" />
                                    Role
                                </p>
                                <p className="text-sm text-gray-900 dark:text-white">{user.role}</p>
                            </div>

                            <div>
                                <p className="text-xs text-gray-500 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    Email Status
                                </p>
                                <p className="text-sm text-gray-900 dark:text-white">
                                    {user.isActive ? 'Verified' : 'Not Verified'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
