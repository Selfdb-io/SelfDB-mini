import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { DataGrid, type Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import {
    readUsersUsersGet,
    createUserUsersPost,
    updateUserUsersUserIdPatch,
    deleteUserUsersUserIdDelete,
} from '../client/sdk.gen';
import type { UserRead, UserRole } from '../client/types.gen';
import { useAuth } from '../context/AuthContext';
import { API_KEY } from '../lib/api';
import { Plus, Pencil, Trash2, RefreshCw, Search, ArrowUpDown, X } from 'lucide-react';
import Modal from '../components/Modal';
import ConfirmationModal from '../components/ConfirmationModal';
import { useTheme } from '../context/ThemeContext';
import { stripName, getErrorMessage, hasError } from '../lib/utils';

type UserRow = UserRead;
type SortByOption = 'created_at' | 'email' | 'first_name' | 'last_name';
type SortOrderOption = 'asc' | 'desc';

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

// Helper function to format dates
const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function Users() {
    const { token } = useAuth();
    const { theme } = useTheme();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Search and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortByOption>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrderOption>('desc');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Confirmation modal
    const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ isOpen: boolean; userId: string | null }>({
        isOpen: false,
        userId: null,
    });

    // Form state for create
    const [createForm, setCreateForm] = useState({
        email: '',
        firstName: '',
        lastName: '',
        password: '',
    });

    // Form state for edit
    const [editForm, setEditForm] = useState({
        email: '',
        firstName: '',
        lastName: '',
        role: 'USER' as UserRole,
        isActive: true,
        password: '',
    });

    const fetchUsers = useCallback(async (pageNum: number = 1, append: boolean = false) => {
        if (!token) return;
        
        try {
            if (pageNum === 1) {
                setLoading(true);
            } else {
                setIsLoadingMore(true);
            }
            
            const skip = (pageNum - 1) * PAGE_SIZE;
            const response = await readUsersUsersGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                query: {
                    skip,
                    limit: PAGE_SIZE,
                    search: searchQuery || undefined,
                    sort_by: sortBy,
                    sort_order: sortOrder,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            if (response.data) {
                if (append) {
                    setUsers(prev => [...prev, ...response.data!]);
                } else {
                    setUsers(response.data);
                }
                // If we got less than PAGE_SIZE, there's no more data
                setHasMore(response.data.length === PAGE_SIZE);
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [token, searchQuery, sortBy, sortOrder]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Handle search input with debounce
    const handleSearchChange = (value: string) => {
        // Clear existing timeout
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        
        // Set new timeout for debounced search
        debounceRef.current = setTimeout(() => {
            setSearchQuery(value);
            setPage(1);
        }, DEBOUNCE_MS);
    };

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    // Clear search
    const clearSearch = () => {
        setSearchQuery('');
        setPage(1);
    };

    // Toggle sort order
    const toggleSortOrder = () => {
        setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
        setPage(1);
    };

    // Infinite scroll handler
    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        
        if (scrollBottom < 100 && hasMore && !isLoadingMore) {
            setPage(prev => prev + 1);
            fetchUsers(page + 1, true);
        }
    }, [hasMore, isLoadingMore, page, fetchUsers]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate and trim email
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

            setIsCreateModalOpen(false);
            setCreateForm({ email: '', firstName: '', lastName: '', password: '' });
            setPage(1);
            fetchUsers();
        } catch (error) {
            console.error('Failed to create user:', error);
            alert(getErrorMessage(error));
        }
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        try {
            const response = await updateUserUsersUserIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: selectedUser.id,
                },
                body: {
                    email: stripName(editForm.email) || null,
                    firstName: stripName(editForm.firstName) || null,
                    lastName: stripName(editForm.lastName) || null,
                    role: editForm.role,
                    isActive: editForm.isActive,
                    password: editForm.password || null,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsEditModalOpen(false);
            setSelectedUser(null);
            setPage(1);
            fetchUsers();
        } catch (error) {
            console.error('Failed to update user:', error);
            alert(getErrorMessage(error));
        }
    };

    const confirmDeleteUser = (userId: string) => {
        setDeleteUserConfirm({ isOpen: true, userId });
    };

    const handleDeleteUser = async () => {
        if (!deleteUserConfirm.userId) return;

        try {
            const response = await deleteUserUsersUserIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    user_id: deleteUserConfirm.userId,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setDeleteUserConfirm({ isOpen: false, userId: null });
            setPage(1);
            fetchUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert(getErrorMessage(error));
        }
    };

    const openEditModal = (user: UserRow) => {
        setSelectedUser(user);
        setEditForm({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role || 'USER',
            isActive: user.isActive ?? true,
            password: '',
        });
        setIsEditModalOpen(true);
    };

    // React Data Grid columns
    const columns: Column<UserRow>[] = useMemo(() => [
        { key: 'email', name: 'Email', resizable: true, minWidth: 200 },
        { key: 'firstName', name: 'First Name', resizable: true, minWidth: 120 },
        { key: 'lastName', name: 'Last Name', resizable: true, minWidth: 120 },
        { 
            key: 'role', 
            name: 'Role', 
            resizable: true, 
            minWidth: 100,
            renderCell: ({ row }) => row.role || 'USER'
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
        {
            key: 'actions',
            name: 'Actions',
            width: 100,
            renderCell: ({ row }) => (
                <div className="flex gap-2">
                    <button
                        onClick={() => openEditModal(row)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit user"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => confirmDeleteUser(row.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete user"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ], []);

    const rowKeyGetter = (row: UserRow) => row.id;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setPage(1);
                            fetchUsers();
                        }}
                        disabled={loading}
                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add User
                    </button>
                </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
                {/* Search Bar */}
                <div className="flex-1 min-w-[300px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by email, first name, or last name..."
                            defaultValue={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-slate-400">Sort by:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => {
                            setSortBy(e.target.value as SortByOption);
                            setPage(1);
                        }}
                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    >
                        <option value="created_at">Created Date</option>
                        <option value="email">Email</option>
                        <option value="first_name">First Name</option>
                        <option value="last_name">Last Name</option>
                    </select>
                    <button
                        onClick={toggleSortOrder}
                        className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                        title={`Sort ${sortOrder === 'desc' ? 'Descending' : 'Ascending'}`}
                    >
                        <ArrowUpDown className="h-4 w-4" />
                        {sortOrder === 'desc' ? 'Desc' : 'Asc'}
                    </button>
                </div>
            </div>

            {/* Active Search Indicator */}
            {searchQuery && (
                <div className="mb-4 text-sm text-gray-500 dark:text-slate-400">
                    Showing results for: <span className="text-gray-900 dark:text-white font-medium">"{searchQuery}"</span>
                </div>
            )}

            {loading ? (
                <div className="text-gray-900 dark:text-white text-center py-12">Loading users...</div>
            ) : (
                <>
                    <DataGrid
                        columns={columns}
                        rows={users}
                        rowKeyGetter={rowKeyGetter}
                        className={theme === 'dark' ? 'rdg-dark' : 'rdg-light'}
                        onScroll={handleScroll}
                        rowHeight={45}
                        headerRowHeight={45}
                        style={{ height: 'calc(100vh - 180px)' }}
                        renderers={{
                            noRowsFallback: (
                                <div className="text-center py-12 text-gray-500 dark:text-slate-400">No users found</div>
                            )
                        }}
                    />
                    {isLoadingMore && (
                        <div className="text-center py-2 text-gray-500 dark:text-slate-400 text-sm">Loading more...</div>
                    )}
                </>
            )}

            {/* Create User Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create New User"
            >
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            value={createForm.email}
                            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">First Name</label>
                        <input
                            type="text"
                            required
                            value={createForm.firstName}
                            onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Last Name</label>
                        <input
                            type="text"
                            required
                            value={createForm.lastName}
                            onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Password</label>
                        <input
                            type="password"
                            required
                            value={createForm.password}
                            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsCreateModalOpen(false)}
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

            {/* Edit User Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit User"
            >
                <form onSubmit={handleEditUser} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                        <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                        <input
                            type="text"
                            value={editForm.firstName}
                            onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                        <input
                            type="text"
                            value={editForm.lastName}
                            onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                        <select
                            value={editForm.role || 'USER'}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={editForm.isActive}
                            onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                            className="w-4 h-4 bg-slate-900 border-slate-700 rounded"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-slate-300">
                            Active
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                            Password (leave blank to keep current)
                        </label>
                        <input
                            type="password"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsEditModalOpen(false)}
                            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                        >
                            Update User
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={deleteUserConfirm.isOpen}
                onClose={() => setDeleteUserConfirm({ isOpen: false, userId: null })}
                onConfirm={handleDeleteUser}
                title="Delete User"
                message="Are you sure you want to delete this user? This action cannot be undone."
                confirmText="Delete User"
                isDangerous={true}
            />
        </div>
    );
}
