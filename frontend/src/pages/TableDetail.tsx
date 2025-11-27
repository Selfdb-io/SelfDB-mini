import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DataGrid, type Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import {
    readTableTablesTableIdGet,
    getTableDataTablesTableIdDataGet,
    addColumnTablesTableIdColumnsPost,
    updateColumnTablesTableIdColumnsColumnNamePatch,
    deleteColumnTablesTableIdColumnsColumnNameDelete,
    insertRowTablesTableIdDataPost,
    updateRowTablesTableIdDataRowIdPatch,
    deleteRowTablesTableIdDataRowIdDelete,
} from '../client/sdk.gen';
import type { TableRead, ColumnDefinition } from '../client/types.gen';
import { useAuth } from '../context/AuthContext';
import { API_KEY } from '../lib/api';
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    RefreshCw,
    Settings,
    ChevronLeft,
    ChevronRight,
    Search,
    ArrowUpDown,
    X,
} from 'lucide-react';
import { Modal, ConfirmationModal, Input, Select, Checkbox, Label } from '../components';
import { DATA_TYPES, DEFAULT_COLUMN_TYPE } from '../lib/constants';
import { useTheme } from '../context/ThemeContext';
import { stripName, stripObjectKeys, getErrorMessage, hasError } from '../lib/utils';

export default function TableDetail() {
    const { tableId } = useParams<{ tableId: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();
    const { theme } = useTheme();

    // Table metadata
    const [table, setTable] = useState<TableRead | null>(null);
    const [loading, setLoading] = useState(true);

    // Data state
    const [tableData, setTableData] = useState<any[]>([]);
    const [totalRows, setTotalRows] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);

    // Schema/columns derived from table
    const [columns, setColumns] = useState<{ name: string; type: string; nullable: boolean }[]>([]);

    // Search and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const DEBOUNCE_MS = 300;

    // Modal states
    const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
    const [isEditColumnModalOpen, setIsEditColumnModalOpen] = useState(false);
    const [isAddRowModalOpen, setIsAddRowModalOpen] = useState(false);
    const [isEditRowModalOpen, setIsEditRowModalOpen] = useState(false);

    // Form states
    const [newColumn, setNewColumn] = useState<ColumnDefinition>({
        name: '',
        type: DEFAULT_COLUMN_TYPE,
        nullable: true,
        default: null,
    });
    const [editColumn, setEditColumn] = useState<{
        originalName: string;
        new_name: string;
        type: string;
        nullable: boolean;
    }>({
        originalName: '',
        new_name: '',
        type: '',
        nullable: true,
    });
    const [newRowData, setNewRowData] = useState<Record<string, any>>({});
    const [editRowData, setEditRowData] = useState<{ id: string; data: Record<string, any> }>({
        id: '',
        data: {},
    });

    // Confirmation modals
    const [deleteColumnConfirm, setDeleteColumnConfirm] = useState<{
        isOpen: boolean;
        columnName: string | null;
    }>({
        isOpen: false,
        columnName: null,
    });
    const [deleteRowConfirm, setDeleteRowConfirm] = useState<{
        isOpen: boolean;
        rowId: string | null;
    }>({
        isOpen: false,
        rowId: null,
    });

    // Fetch table metadata
    const fetchTable = useCallback(async () => {
        if (!token || !tableId) return;

        try {
            setLoading(true);
            const response = await readTableTablesTableIdGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            if (response.data) {
                setTable(response.data);
                // Extract columns from schema
                const schema = response.data.schema || {};
                const cols = Object.entries(schema).map(([name, def]: [string, any]) => ({
                    name,
                    type: def?.type || 'VARCHAR(255)',
                    nullable: def?.nullable ?? true,
                }));
                setColumns(cols);
            }
        } catch (error) {
            console.error('Failed to fetch table:', error);
            alert(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [token, tableId]);

    // Fetch table data
    const fetchData = useCallback(async () => {
        if (!token || !tableId) return;

        try {
            const response = await getTableDataTablesTableIdDataGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                },
                query: {
                    page,
                    page_size: pageSize,
                    search: searchQuery || undefined,
                    sort_by: sortBy || undefined,
                    sort_order: sortOrder,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            if (response.data) {
                setTableData(response.data.data || []);
                setTotalRows(response.data.total || 0);
            }
        } catch (error) {
            console.error('Failed to fetch table data:', error);
            alert(getErrorMessage(error));
        }
    }, [token, tableId, page, pageSize, searchQuery, sortBy, sortOrder]);

    // Handle search input with debounce
    const handleSearchChange = (value: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
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

    useEffect(() => {
        fetchTable();
    }, [fetchTable]);

    useEffect(() => {
        if (table) {
            fetchData();
        }
    }, [table, fetchData]);

    // Column operations
    const handleAddColumn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId) return;

        // Validate and trim column name
        const columnName = stripName(newColumn.name);
        if (!columnName) {
            alert('Column name cannot be empty');
            return;
        }

        try {
            const response = await addColumnTablesTableIdColumnsPost({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                },
                body: {
                    ...newColumn,
                    name: columnName,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsAddColumnModalOpen(false);
            setNewColumn({
                name: '',
                type: DEFAULT_COLUMN_TYPE,
                nullable: true,
                default: null,
            });
            fetchTable();
            fetchData();
        } catch (error) {
            console.error('Failed to add column:', error);
            alert(getErrorMessage(error));
        }
    };

    const openEditColumnModal = (col: { name: string; type: string; nullable: boolean }) => {
        setEditColumn({
            originalName: col.name,
            new_name: col.name,
            type: col.type,
            nullable: col.nullable,
        });
        setIsEditColumnModalOpen(true);
    };

    const handleUpdateColumn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId) return;

        // Validate and trim new column name
        const newColumnName = stripName(editColumn.new_name);
        if (!newColumnName) {
            alert('Column name cannot be empty');
            return;
        }

        try {
            const response = await updateColumnTablesTableIdColumnsColumnNamePatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    column_name: editColumn.originalName,
                },
                body: {
                    new_name: newColumnName !== editColumn.originalName ? newColumnName : null,
                    type: editColumn.type,
                    nullable: editColumn.nullable,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsEditColumnModalOpen(false);
            fetchTable();
            fetchData();
        } catch (error) {
            console.error('Failed to update column:', error);
            alert(getErrorMessage(error));
        }
    };

    const handleDeleteColumn = async () => {
        if (!tableId || !deleteColumnConfirm.columnName) return;

        try {
            const response = await deleteColumnTablesTableIdColumnsColumnNameDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    column_name: deleteColumnConfirm.columnName,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setDeleteColumnConfirm({ isOpen: false, columnName: null });
            fetchTable();
            fetchData();
        } catch (error) {
            console.error('Failed to delete column:', error);
            alert(getErrorMessage(error));
        }
    };

    // Row operations
    const openAddRowModal = () => {
        const initialData: Record<string, any> = {};
        columns.forEach((col) => {
            // Skip id column if it's a UUID type (auto-generated by backend)
            if (col.name.toLowerCase() === 'id' && col.type.toLowerCase().includes('uuid')) {
                return;
            }
            initialData[col.name] = '';
        });
        setNewRowData(initialData);
        setIsAddRowModalOpen(true);
    };

    const handleAddRow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId) return;

        try {
            // Filter out empty string values, convert types as needed, and trim keys
            const cleanData: Record<string, any> = {};
            Object.entries(newRowData).forEach(([key, value]) => {
                const trimmedKey = stripName(key);
                if (value !== '' && value !== null && value !== undefined && trimmedKey) {
                    cleanData[trimmedKey] = value;
                }
            });

            const response = await insertRowTablesTableIdDataPost({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                },
                body: cleanData,
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsAddRowModalOpen(false);
            setNewRowData({});
            fetchData();
            fetchTable(); // Refresh row count
        } catch (error) {
            console.error('Failed to add row:', error);
            alert(getErrorMessage(error));
        }
    };

    const openEditRowModal = (row: any) => {
        setEditRowData({
            id: row.id,
            data: { ...row },
        });
        setIsEditRowModalOpen(true);
    };

    const handleUpdateRow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId || !editRowData.id) return;

        try {
            // Remove id from the update data and trim keys
            const { id, ...rawUpdateData } = editRowData.data;
            const updateData = stripObjectKeys(rawUpdateData);

            const response = await updateRowTablesTableIdDataRowIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    row_id: editRowData.id,
                },
                body: updateData,
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setIsEditRowModalOpen(false);
            setEditRowData({ id: '', data: {} });
            fetchData();
        } catch (error) {
            console.error('Failed to update row:', error);
            alert(getErrorMessage(error));
        }
    };

    const handleDeleteRow = async () => {
        if (!tableId || !deleteRowConfirm.rowId) return;

        try {
            const response = await deleteRowTablesTableIdDataRowIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    row_id: deleteRowConfirm.rowId,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            setDeleteRowConfirm({ isOpen: false, rowId: null });
            fetchData();
            fetchTable(); // Refresh row count
        } catch (error) {
            console.error('Failed to delete row:', error);
            alert(getErrorMessage(error));
        }
    };

    // Build table columns for data display using react-data-grid
    const dataGridColumns: Column<any>[] = useMemo(() => {
        const cols: Column<any>[] = columns.map((col) => ({
            key: col.name,
            name: (
                <div className="flex items-center justify-between gap-2 group w-full">
                    <div className="flex flex-col">
                        <span>{col.name.toUpperCase()}</span>
                        <span className="text-[10px] text-gray-500 dark:text-slate-500 font-normal normal-case">
                            {col.type} • {col.nullable ? 'null' : 'req'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openEditColumnModal(col);
                            }}
                            className="p-1 text-gray-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors"
                            title="Edit column"
                        >
                            <Settings className="h-3 w-3" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteColumnConfirm({ isOpen: true, columnName: col.name });
                            }}
                            className="p-1 text-gray-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition-colors"
                            title="Delete column"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            ) as any,
            resizable: true,
            minWidth: 150,
            renderCell: ({ row }: { row: any }) => {
                const value = row[col.name];
                if (value === null || value === undefined) {
                    return <span className="text-gray-400 dark:text-slate-500 italic">null</span>;
                }
                if (typeof value === 'object') {
                    return <span className="text-xs font-mono">{JSON.stringify(value)}</span>;
                }
                if (typeof value === 'boolean') {
                    return value ? 'true' : 'false';
                }
                return String(value);
            },
        }));

        // Add actions column
        cols.push({
            key: 'actions',
            name: 'ACTIONS',
            width: 120,
            renderCell: ({ row }: { row: any }) => (
                <div className="flex items-center gap-2 pr-4">
                    <button
                        onClick={() => openEditRowModal(row)}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit row"
                    >
                        <Pencil className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setDeleteRowConfirm({ isOpen: true, rowId: row.id })}
                        className="p-2 text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete row"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            ),
        });

        return cols;
    }, [columns]);

    const rowKeyGetter = (row: any) => row.id;

    // Infinite scroll handler
    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        
        // Load more when near the bottom
        if (scrollBottom < 100 && page * pageSize < totalRows) {
            setPage(prev => prev + 1);
        }
    }, [page, pageSize, totalRows]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 text-primary-400 animate-spin" />
            </div>
        );
    }

    if (!table) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500 dark:text-slate-400">Table not found</p>
                <button
                    onClick={() => navigate('/tables')}
                    className="mt-4 text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300"
                >
                    Back to Tables
                </button>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/tables')}
                        className="p-2 text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{table.name}</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                            {table.description || 'No description'} •{' '}
                            <span className={table.public ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-slate-500'}>
                                {table.public ? 'Public' : 'Private'}
                            </span>{' '}
                            • {totalRows} rows
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            fetchTable();
                            fetchData();
                        }}
                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsAddColumnModalOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Column
                    </button>
                    <button
                        onClick={openAddRowModal}
                        disabled={columns.length === 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Row
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
                            placeholder="Search data..."
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
                        value={sortBy || ''}
                        onChange={(e) => {
                            setSortBy(e.target.value || null);
                            setPage(1);
                        }}
                        containerClassName="w-auto"
                    >
                        <option value="">None</option>
                        {columns.map((col) => (
                            <option key={col.name} value={col.name}>
                                {col.name}
                            </option>
                        ))}
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

            {/* Data Table */}
            {columns.length === 0 ? (
                <div className="text-gray-900 dark:text-white text-center py-12">
                    No columns defined. Click "New Column" to add your first column.
                </div>
            ) : (
                <>
                    <DataGrid
                        columns={dataGridColumns}
                        rows={tableData}
                        rowKeyGetter={rowKeyGetter}
                        className={theme === 'dark' ? 'rdg-dark' : 'rdg-light'}
                        onScroll={handleScroll}
                        rowHeight={45}
                        headerRowHeight={55}
                        style={{ height: 'calc(100vh - 280px)' }}
                        renderers={{
                            noRowsFallback: (
                                <div className="text-center py-12 text-gray-500 dark:text-slate-400">
                                    No data yet. Click "New Row" to insert data.
                                </div>
                            )
                        }}
                    />
                    {/* Footer */}
                    <div className="flex items-center justify-between py-3 text-sm text-gray-500 dark:text-slate-400">
                        <span>Total rows: {totalRows}</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span>Page {page}</span>
                            <button
                                onClick={() => setPage((p) => p + 1)}
                                disabled={page * pageSize >= totalRows}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Add Column Modal */}
            <Modal isOpen={isAddColumnModalOpen} onClose={() => setIsAddColumnModalOpen(false)} title="Add Column">
                <form onSubmit={handleAddColumn} className="space-y-4">
                    <div>
                        <Label>Column Name</Label>
                        <Input
                            type="text"
                            value={newColumn.name}
                            onChange={(e) => setNewColumn({ ...newColumn, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            placeholder="column_name"
                            required
                            hint="Lowercase letters, numbers, and underscores only"
                        />
                    </div>
                    <div>
                        <Label>Type</Label>
                        <Select
                            value={newColumn.type}
                            onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })}
                        >
                            {DATA_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <Checkbox
                        id="nullable"
                        checked={newColumn.nullable}
                        onChange={(e) => setNewColumn({ ...newColumn, nullable: e.target.checked })}
                        label="Allow NULL values"
                    />
                    <div>
                        <Label>Default Value (optional)</Label>
                        <Input
                            type="text"
                            value={newColumn.default || ''}
                            onChange={(e) => setNewColumn({ ...newColumn, default: e.target.value || null })}
                            placeholder="e.g., 'default value' or 0"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsAddColumnModalOpen(false)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                        >
                            Add Column
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit Column Modal */}
            <Modal isOpen={isEditColumnModalOpen} onClose={() => setIsEditColumnModalOpen(false)} title="Edit Column">
                <form onSubmit={handleUpdateColumn} className="space-y-4">
                    <div>
                        <Label>Column Name</Label>
                        <Input
                            type="text"
                            value={editColumn.new_name}
                            onChange={(e) => setEditColumn({ ...editColumn, new_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            required
                        />
                    </div>
                    <div>
                        <Label>Type</Label>
                        <Select
                            value={editColumn.type}
                            onChange={(e) => setEditColumn({ ...editColumn, type: e.target.value })}
                            hint="⚠️ Changing type may fail if data is incompatible"
                        >
                            {DATA_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <Checkbox
                        id="edit-nullable"
                        checked={editColumn.nullable}
                        onChange={(e) => setEditColumn({ ...editColumn, nullable: e.target.checked })}
                        label="Allow NULL values"
                    />
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsEditColumnModalOpen(false)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Add Row Modal */}
            <Modal isOpen={isAddRowModalOpen} onClose={() => setIsAddRowModalOpen(false)} title="Add Row">
                <form onSubmit={handleAddRow} className="space-y-4">
                    {columns
                        .filter((col) => !(col.name.toLowerCase() === 'id' && col.type.toLowerCase().includes('uuid')))
                        .map((col) => (
                        <div key={col.name}>
                            <Label required={!col.nullable}>{col.name}</Label>
                            <Input
                                type="text"
                                value={newRowData[col.name] || ''}
                                onChange={(e) => setNewRowData({ ...newRowData, [col.name]: e.target.value })}
                                className="focus:ring-green-500"
                                placeholder={col.type}
                                required={!col.nullable}
                            />
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsAddRowModalOpen(false)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
                        >
                            Add Row
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit Row Modal */}
            <Modal isOpen={isEditRowModalOpen} onClose={() => setIsEditRowModalOpen(false)} title="Edit Row">
                <form onSubmit={handleUpdateRow} className="space-y-4">
                    {columns.map((col) => (
                        <div key={col.name}>
                            <Label required={!col.nullable}>{col.name}</Label>
                            <Input
                                type="text"
                                value={editRowData.data[col.name] ?? ''}
                                onChange={(e) =>
                                    setEditRowData({
                                        ...editRowData,
                                        data: { ...editRowData.data, [col.name]: e.target.value },
                                    })
                                }
                                className="focus:ring-blue-500"
                                placeholder={col.type}
                                required={!col.nullable}
                            />
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 pt-4">
                        <button
                            type="button"
                            onClick={() => setIsEditRowModalOpen(false)}
                            className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete Column Confirmation */}
            <ConfirmationModal
                isOpen={deleteColumnConfirm.isOpen}
                onClose={() => setDeleteColumnConfirm({ isOpen: false, columnName: null })}
                onConfirm={handleDeleteColumn}
                title="Delete Column"
                message={`Are you sure you want to delete the column "${deleteColumnConfirm.columnName}"? This will permanently remove all data in this column.`}
                confirmText="Delete"
                isDangerous={true}
            />

            {/* Delete Row Confirmation */}
            <ConfirmationModal
                isOpen={deleteRowConfirm.isOpen}
                onClose={() => setDeleteRowConfirm({ isOpen: false, rowId: null })}
                onConfirm={handleDeleteRow}
                title="Delete Row"
                message="Are you sure you want to delete this row? This action cannot be undone."
                confirmText="Delete"
                isDangerous={true}
            />
        </div>
    );
}
