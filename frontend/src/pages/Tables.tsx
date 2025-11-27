import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataGrid, type Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import {
    readTablesTablesGet,
    createTableTablesPost,
    updateTableTablesTableIdPatch,
    deleteTableTablesTableIdDelete,
    getTableDataTablesTableIdDataGet,
    insertRowTablesTableIdDataPost,
    deleteRowTablesTableIdDataRowIdDelete,
} from '../client/sdk.gen';
import type { TableRead } from '../client/types.gen';
import { useAuth } from '../context/AuthContext';
import { API_KEY } from '../lib/api';
import { Plus, Pencil, Trash2, RefreshCw, Database, Eye, ExternalLink, Search, ArrowUpDown, X } from 'lucide-react';
import { Modal, ConfirmationModal, Input, Textarea, Select, Checkbox, Label } from '../components';
import { DATA_TYPES } from '../lib/constants';
import { useTheme } from '../context/ThemeContext';
import { stripName, getErrorMessage, hasError } from '../lib/utils';

type TableRow = TableRead;
type SortByOption = 'created_at' | 'updated_at' | 'name';
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

export default function Tables() {
    const { token } = useAuth();
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [tables, setTables] = useState<TableRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isViewDataModalOpen, setIsViewDataModalOpen] = useState(false);
    const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);
    const [tableData, setTableData] = useState<any[]>([]);
    const [tableSchema, setTableSchema] = useState<any>({});
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Search and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortByOption>('created_at');
    const [sortOrder, setSortOrder] = useState<SortOrderOption>('desc');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Confirmation modals
    const [deleteTableConfirm, setDeleteTableConfirm] = useState<{ isOpen: boolean; tableId: string | null }>({
        isOpen: false,
        tableId: null,
    });
    const [deleteRowConfirm, setDeleteRowConfirm] = useState<{ isOpen: boolean; rowId: string | null }>({
        isOpen: false,
        rowId: null,
    });

    // Form state for create
    const [createForm, setCreateForm] = useState({
        name: '',
        description: '',
        public: false,
        columns: [{ name: 'id', type: 'uuid', nullable: false }],
    });

    // Form state for edit
    const [editForm, setEditForm] = useState({
        name: '',
        description: '',
        public: false,
    });

    const fetchTables = useCallback(async (pageNum: number = 1, append: boolean = false) => {
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            if (pageNum === 1) {
                setLoading(true);
            } else {
                setIsLoadingMore(true);
            }
            
            const skip = (pageNum - 1) * PAGE_SIZE;
            const response = await readTablesTablesGet({
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
                    setTables(prev => [...prev, ...response.data!]);
                } else {
                    setTables(response.data);
                }
                // If we got less than PAGE_SIZE, there's no more data
                setHasMore(response.data.length === PAGE_SIZE);
            }
        } catch (error) {
            // Error handled silently - tables list will remain empty
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [token, searchQuery, sortBy, sortOrder]);

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

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
            fetchTables(page + 1, true);
        }
    }, [hasMore, isLoadingMore, page, fetchTables]);

    const handleCreateTable = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate and trim table name
        const tableName = stripName(createForm.name);
        if (!tableName) {
            alert('Table name cannot be empty');
            return;
        }
        
        try {
            // Build schema from columns with trimmed names
            const schema: any = {};
            for (const col of createForm.columns) {
                const colName = stripName(col.name);
                if (!colName) {
                    alert('Column names cannot be empty');
                    return;
                }
                schema[colName] = {
                    type: col.type,
                    nullable: col.nullable,
                };
            }

            const response = await createTableTablesPost({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                body: {
                    name: tableName,
                    description: stripName(createForm.description) || null,
                    public: createForm.public,
                    schema: schema,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsCreateModalOpen(false);
            setCreateForm({
                name: '',
                description: '',
                public: false,
                columns: [{ name: 'id', type: 'uuid', nullable: false }],
            });
            fetchTables();
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const handleEditTable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTable) return;

        // Validate and trim table name
        const tableName = stripName(editForm.name);
        if (!tableName) {
            alert('Table name cannot be empty');
            return;
        }

        try {
            const response = await updateTableTablesTableIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: selectedTable.id,
                },
                body: {
                    name: tableName !== selectedTable.name ? tableName : undefined,
                    description: stripName(editForm.description) || null,
                    public: editForm.public,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsEditModalOpen(false);
            setSelectedTable(null);
            fetchTables();
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const confirmDeleteTable = (tableId: string) => {
        setDeleteTableConfirm({ isOpen: true, tableId });
    };

    const handleDeleteTable = async () => {
        if (!deleteTableConfirm.tableId) return;

        try {
            const response = await deleteTableTablesTableIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: deleteTableConfirm.tableId,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setDeleteTableConfirm({ isOpen: false, tableId: null });
            fetchTables();
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const openEditModal = (table: TableRow) => {
        setSelectedTable(table);
        setEditForm({
            name: table.name,
            description: table.description || '',
            public: table.public ?? false,
        });
        setIsEditModalOpen(true);
    };

    const openViewDataModal = async (table: TableRow) => {
        setSelectedTable(table);
        setTableSchema(table.schema);
        setIsViewDataModalOpen(true);

        try {
            // Fetch table data
            const dataResponse = await getTableDataTablesTableIdDataGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: table.id,
                },
                query: {
                    page: 1,
                    page_size: 100,
                },
            });

            if (dataResponse.data) {
                setTableData(dataResponse.data.data || []);
            }
            
            if (hasError(dataResponse)) {
                throw new Error(getErrorMessage(dataResponse.error));
            }
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const handleAddRow = async () => {
        if (!selectedTable) return;

        try {
            const newRow: any = {};
            Object.keys(tableSchema).forEach((key) => {
                newRow[stripName(key)] = '';
            });

            const response = await insertRowTablesTableIdDataPost({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: selectedTable.id,
                },
                body: newRow,
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            // Refresh data
            openViewDataModal(selectedTable);
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const confirmDeleteRow = (rowId: string) => {
        setDeleteRowConfirm({ isOpen: true, rowId });
    };

    const handleDeleteRow = async () => {
        if (!selectedTable || !deleteRowConfirm.rowId) return;

        try {
            const response = await deleteRowTablesTableIdDataRowIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: selectedTable.id,
                    row_id: deleteRowConfirm.rowId,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setDeleteRowConfirm({ isOpen: false, rowId: null });
            // Refresh data
            openViewDataModal(selectedTable);
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    const handleAddColumn = () => {
        setCreateForm({
            ...createForm,
            columns: [...createForm.columns, { name: '', type: 'text', nullable: true }],
        });
    };

    const handleRemoveColumn = (index: number) => {
        const newColumns = createForm.columns.filter((_, i) => i !== index);
        setCreateForm({ ...createForm, columns: newColumns });
    };

    const handleColumnChange = (index: number, field: string, value: any) => {
        const newColumns = [...createForm.columns];
        newColumns[index] = { ...newColumns[index], [field]: value };
        setCreateForm({ ...createForm, columns: newColumns });
    };

    // React Data Grid columns for tables list
    const columns: Column<TableRow>[] = useMemo(() => [
        { 
            key: 'name', 
            name: 'Name', 
            resizable: true, 
            minWidth: 200,
            renderCell: ({ row }) => (
                <button
                    onClick={() => navigate(`/tables/${row.id}`)}
                    className="flex items-center gap-2 hover:text-primary-400 transition-colors"
                >
                    <Database className="h-4 w-4 text-primary-400" />
                    <span className="font-medium">{row.name}</span>
                </button>
            )
        },
        { 
            key: 'description', 
            name: 'Description', 
            resizable: true, 
            minWidth: 200,
            renderCell: ({ row }) => row.description || <span className="text-gray-500 dark:text-slate-500">No description</span>
        },
        { 
            key: 'public', 
            name: 'Visibility', 
            resizable: true, 
            minWidth: 100,
            renderCell: ({ row }) => (
                <span
                    className={`px-2 py-1 rounded-full text-xs ${
                        row.public ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-500/10 dark:bg-slate-500/10 text-gray-500 dark:text-slate-400'
                    }`}
                >
                    {row.public ? 'Public' : 'Private'}
                </span>
            )
        },
        { 
            key: 'row_count', 
            name: 'Rows', 
            resizable: true, 
            minWidth: 80,
            renderCell: ({ row }) => row.row_count ?? 0
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
            key: 'updated_at',
            name: 'Updated At',
            resizable: true,
            minWidth: 180,
            renderCell: ({ row }) => (
                <span className="text-gray-500 dark:text-slate-400 text-sm">
                    {formatDate(row.updated_at)}
                </span>
            )
        },
        {
            key: 'actions',
            name: 'Actions',
            width: 180,
            renderCell: ({ row }) => (
                <div className="flex gap-2 pr-4">
                    <button
                        onClick={() => navigate(`/tables/${row.id}`)}
                        className="p-2 text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Open table details"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => openViewDataModal(row)}
                        className="p-2 text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Quick view data"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => openEditModal(row)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit table"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => confirmDeleteTable(row.id)}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete table"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ),
        },
    ], [navigate]);

    // Build dynamic columns for table data view modal
    const dataColumns: Column<any>[] = useMemo(() => {
        const cols: Column<any>[] = Object.keys(tableSchema).map((key) => ({
            key,
            name: key,
            resizable: true,
            minWidth: 100,
            renderCell: ({ row }: { row: any }) => {
                const value = row[key];
                return value !== null && value !== undefined ? String(value) : '';
            }
        }));

        // Add actions column
        cols.push({
            key: 'actions',
            name: 'Actions',
            width: 80,
            renderCell: ({ row }: { row: any }) => (
                <button
                    onClick={() => confirmDeleteRow(row.id)}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                    title="Delete row"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            ),
        });

        return cols;
    }, [tableSchema]);

    const rowKeyGetter = (row: TableRow) => row.id;
    const dataRowKeyGetter = (row: any) => row.id;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Table Management</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setPage(1);
                            fetchTables();
                        }}
                        disabled={loading}
                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Create Table
                    </button>
                </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
                {/* Search Bar */}
                <div className="flex-1 min-w-[300px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400 z-10" />
                        <Input
                            type="text"
                            placeholder="Search by name or description..."
                            defaultValue={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="pl-10 pr-10 bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-700"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-white z-10"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-slate-400">Sort by:</span>
                    <Select
                        value={sortBy}
                        onChange={(e) => {
                            setSortBy(e.target.value as SortByOption);
                            setPage(1);
                        }}
                        containerClassName="w-auto"
                    >
                        <option value="created_at">Created Date</option>
                        <option value="updated_at">Updated Date</option>
                        <option value="name">Name</option>
                    </Select>
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
                <div className="text-gray-900 dark:text-white text-center py-12">Loading tables...</div>
            ) : (
                <>
                    <DataGrid
                        columns={columns}
                        rows={tables}
                        rowKeyGetter={rowKeyGetter}
                        className={theme === 'dark' ? 'rdg-dark' : 'rdg-light'}
                        onScroll={handleScroll}
                        rowHeight={45}
                        headerRowHeight={45}
                        style={{ height: 'calc(100vh - 180px)' }}
                        renderers={{
                            noRowsFallback: (
                                <div className="text-center py-12 text-gray-500 dark:text-slate-400">No tables found</div>
                            )
                        }}
                    />
                    {isLoadingMore && (
                        <div className="text-center py-2 text-gray-500 dark:text-slate-400 text-sm">Loading more...</div>
                    )}
                </>
            )}

            {/* Create Table Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Create New Table"
            >
                <form onSubmit={handleCreateTable} className="space-y-4">
                    <div>
                        <Label>Table Name</Label>
                        <Input
                            type="text"
                            required
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            placeholder="e.g., users, products"
                            hint="Lowercase letters, numbers, underscores only"
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={createForm.description}
                            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                            rows={2}
                        />
                    </div>
                    <Checkbox
                        id="public"
                        checked={createForm.public}
                        onChange={(e) => setCreateForm({ ...createForm, public: e.target.checked })}
                        label="Public (accessible to everyone)"
                    />

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <Label className="mb-0">Columns</Label>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto p-1 -m-1">
                            {createForm.columns.map((col, index) => (
                                <div key={index} className="flex gap-3 items-center">
                                    <Input
                                        type="text"
                                        value={col.name}
                                        onChange={(e) => handleColumnChange(index, 'name', e.target.value)}
                                        placeholder="Column name"
                                        className="flex-1 min-w-0"
                                    />
                                    <Select
                                        value={col.type}
                                        onChange={(e) => handleColumnChange(index, 'type', e.target.value)}
                                        containerClassName="w-32 shrink-0"
                                    >
                                        {DATA_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </Select>
                                    <Checkbox
                                        checked={col.nullable}
                                        onChange={(e) => handleColumnChange(index, 'nullable', e.target.checked)}
                                        label="Null"
                                        className="shrink-0"
                                    />
                                    {createForm.columns.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveColumn(index)}
                                            className="p-1 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={handleAddColumn}
                            className="mt-2 w-full px-3 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-1"
                        >
                            <Plus className="h-4 w-4" />
                            Add Column
                        </button>
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
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                        >
                            Create Table
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit Table Modal */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title="Edit Table"
            >
                <form onSubmit={handleEditTable} className="space-y-4">
                    <div>
                        <Label>Table Name</Label>
                        <Input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            required
                            hint="Lowercase letters, numbers, underscores only"
                        />
                    </div>
                    <div>
                        <Label>Description</Label>
                        <Textarea
                            value={editForm.description}
                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                            rows={2}
                        />
                    </div>
                    <Checkbox
                        id="editPublic"
                        checked={editForm.public}
                        onChange={(e) => setEditForm({ ...editForm, public: e.target.checked })}
                        label="Public (accessible to everyone)"
                    />
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsEditModalOpen(false)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                        >
                            Update Table
                        </button>
                    </div>
                </form>
            </Modal>

            {/* View Table Data Modal */}
            <Modal
                isOpen={isViewDataModalOpen}
                onClose={() => setIsViewDataModalOpen(false)}
                title={`Table Data: ${selectedTable?.name || ''}`}
            >
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <p className="text-gray-500 dark:text-slate-400 text-sm">{tableData.length} rows</p>
                        <button
                            onClick={handleAddRow}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-500 transition-colors flex items-center gap-1"
                        >
                            <Plus className="h-3 w-3" />
                            Add Row
                        </button>
                    </div>

                    {Object.keys(tableSchema).length > 0 ? (
                        <div className="max-h-96 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
                            <DataGrid
                                columns={dataColumns}
                                rows={tableData}
                                rowKeyGetter={dataRowKeyGetter}
                                className={theme === 'dark' ? 'rdg-dark' : 'rdg-light'}
                                style={{ height: '350px' }}
                                rowHeight={35}
                                headerRowHeight={35}
                                renderers={{
                                    noRowsFallback: (
                                        <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                                            No data available. Click "Add Row" to insert data.
                                        </div>
                                    )
                                }}
                            />
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-slate-400">No schema defined for this table.</div>
                    )}
                </div>
            </Modal>

            {/* Confirmation Modals */}
            <ConfirmationModal
                isOpen={deleteTableConfirm.isOpen}
                onClose={() => setDeleteTableConfirm({ isOpen: false, tableId: null })}
                onConfirm={handleDeleteTable}
                title="Delete Table"
                message="Are you sure you want to delete this table? This will permanently delete all data in the table."
                confirmText="Delete Table"
                isDangerous={true}
            />

            <ConfirmationModal
                isOpen={deleteRowConfirm.isOpen}
                onClose={() => setDeleteRowConfirm({ isOpen: false, rowId: null })}
                onConfirm={handleDeleteRow}
                title="Delete Row"
                message="Are you sure you want to delete this row? This action cannot be undone."
                confirmText="Delete Row"
                isDangerous={true}
            />
        </div>
    );
}
