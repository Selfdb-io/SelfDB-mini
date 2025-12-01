import { useState, useMemo } from 'react';
import { textEditor, type Column, type RenderEditCellProps } from 'react-data-grid';
import {
    readUsersUsersGet,
    createUserUsersPost,
    updateUserUsersUserIdPatch,
    deleteUserUsersUserIdDelete,
} from '../client/sdk.gen';
import type { UserRead, UserRole } from '../client/types.gen';
import { useAuth } from '../context/AuthContext';
import { API_KEY } from '../lib/api';
import { Modal, Input, Label, DataTable, type DataTableApi, type SortOption, type ExportConfig } from '../components';
import { stripName, getErrorMessage, hasError } from '../lib/utils';
import { formatDate } from '../lib/formatDate';

type UserRow = UserRead;

const PAGE_SIZE = 50;

// Sort options for the dropdown
const SORT_OPTIONS: SortOption[] = [
    { value: 'created_at', label: 'Created Date' },
    { value: 'email', label: 'Email' },
    { value: 'first_name', label: 'First Name' },
    { value: 'last_name', label: 'Last Name' },
];

// Export configuration
const EXPORT_CONFIG: ExportConfig = {
    columns: [
        { key: 'email', name: 'Email' },
        { key: 'firstName', name: 'First Name' },
        { key: 'lastName', name: 'Last Name' },
        { key: 'role', name: 'Role' },
        { key: 'isActive', name: 'Active' },
        { key: 'created_at', name: 'Created At' },
    ],
    filename: 'users.csv',
};

export default function Users() {
    const { token } = useAuth();

    // Create modal state
    const [createForm, setCreateForm] = useState({
        email: '',
        firstName: '',
        lastName: '',
        password: '',
    });

    // API operations for DataTable
    const api: DataTableApi<UserRow> = useMemo(() => ({
        fetch: async ({ page, pageSize, search, sortBy, sortOrder }) => {
            if (!token) {
                return { data: [], hasMore: false };
            }

            const skip = (page - 1) * pageSize;
            const response = await readUsersUsersGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                query: {
                    skip,
                    limit: pageSize,
                    search: search || undefined,
                    sort_by: sortBy as 'created_at' | 'email' | 'first_name' | 'last_name' | undefined,
                    sort_order: sortOrder,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            return {
                data: response.data || [],
                hasMore: (response.data?.length || 0) === pageSize,
            };
        },

        update: async (id, data) => {
            const response = await updateUserUsersUserIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: id,
                },
                body: {
                    email: data.email || null,
                    firstName: data.firstName || null,
                    lastName: data.lastName || null,
                    role: data.role || 'USER',
                    isActive: data.isActive ?? true,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            return response.data as UserRow;
        },

        delete: async (id) => {
            const response = await deleteUserUsersUserIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: id,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }
        },
    }), [token]);

    // Column definitions with inline editing
    const columns: Column<UserRow>[] = useMemo(() => [
        { 
            key: 'id', 
            name: 'ID', 
            resizable: true, 
            minWidth: 280,
            renderCell: ({ row }) => (
                <span className="text-gray-500 dark:text-slate-400 text-xs font-mono">
                    {row.id}
                </span>
            )
        },
        { 
            key: 'email', 
            name: 'Email', 
            resizable: true, 
            minWidth: 200,
            renderEditCell: textEditor
        },
        { 
            key: 'firstName', 
            name: 'First Name', 
            resizable: true, 
            minWidth: 120,
            renderEditCell: textEditor
        },
        { 
            key: 'lastName', 
            name: 'Last Name', 
            resizable: true, 
            minWidth: 120,
            renderEditCell: textEditor
        },
        { 
            key: 'role', 
            name: 'Role', 
            resizable: true, 
            minWidth: 120,
            renderCell: ({ row }) => (
                <span className={`px-2 py-1 rounded-full text-xs ${
                    row.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-400' : 'bg-gray-500/10 text-gray-400'
                }`}>
                    {row.role || 'USER'}
                </span>
            ),
            renderEditCell: ({ row, onRowChange }: RenderEditCellProps<UserRow>) => (
                <select
                    className="w-full h-full px-2 bg-white dark:bg-slate-800 border-0 text-gray-900 dark:text-white focus:outline-none"
                    value={row.role || 'USER'}
                    onChange={(e) => onRowChange({ ...row, role: e.target.value as UserRole }, true)}
                    autoFocus
                >
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                </select>
            )
        },
        { 
            key: 'isActive', 
            name: 'Active', 
            resizable: true, 
            minWidth: 100,
            renderCell: ({ row }) => (
                <span
                    className={`px-2 py-1 rounded-full text-xs ${
                        row.isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}
                >
                    {row.isActive ? 'Active' : 'Inactive'}
                </span>
            ),
            renderEditCell: ({ row, onRowChange }: RenderEditCellProps<UserRow>) => (
                <select
                    className="w-full h-full px-2 bg-white dark:bg-slate-800 border-0 text-gray-900 dark:text-white focus:outline-none"
                    value={row.isActive ? 'true' : 'false'}
                    onChange={(e) => onRowChange({ ...row, isActive: e.target.value === 'true' }, true)}
                    autoFocus
                >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            )
        },
        {
            key: 'created_at',
            name: 'Created At',
            resizable: true,
            minWidth: 180,
            renderCell: ({ row }) => (
                <span className="text-gray-500 dark:text-slate-400 text-sm">
                    {formatDate(row.created_at)}
                </span>
            )
        },
    ], []);

    // Handle create user form submission
    const handleCreateUser = async (onSuccess: () => void) => {
        const email = stripName(createForm.email);
        if (!email) {
            alert('Email cannot be empty');
            return;
        }
        
        try {
            const response = await createUserUsersPost({
                headers: {
                    'X-API-Key': API_KEY,
                },
                body: {
                    email: email,
                    firstName: stripName(createForm.firstName),
                    lastName: stripName(createForm.lastName),
                    password: createForm.password,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setCreateForm({ email: '', firstName: '', lastName: '', password: '' });
            onSuccess();
        } catch (error) {
            console.error('Failed to create user:', error);
            alert(getErrorMessage(error));
        }
    };

    return (
        <DataTable<UserRow>
            columns={columns}
            api={api}
            title="User Management"
            entityName="user"
            sortOptions={SORT_OPTIONS}
            exportConfig={EXPORT_CONFIG}
            pageSize={PAGE_SIZE}
            defaultSortBy="created_at"
            defaultSortOrder="desc"
            searchPlaceholder="Search by email, first name, or last name..."
            createButtonLabel="Add User"
            emptyMessage="No users found"
            loadingMessage="Loading users..."
            renderCreateModal={({ isOpen, onClose, onSuccess }) => (
                <Modal
                    isOpen={isOpen}
                    onClose={onClose}
                    title="Create New User"
                >
                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleCreateUser(onSuccess);
                        }} 
                        className="space-y-4"
                    >
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                required
                                value={createForm.email}
                                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                type="text"
                                required
                                value={createForm.firstName}
                                onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                type="text"
                                required
                                value={createForm.lastName}
                                onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={createForm.password}
                                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                            >
                                Create User
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        />
    );
}
