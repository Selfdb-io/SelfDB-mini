import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { textEditor, type Column } from 'react-data-grid';
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
import { Plus, Trash2, Settings, RefreshCw } from 'lucide-react';
import {
    Modal,
    ConfirmationModal,
    Input,
    Select,
    Checkbox,
    Label,
    DataTable,
} from '../components';
import type { DataTableApi, SortOption, ExportConfig, FetchParams } from '../components/DataTable/types';
import { DATA_TYPES, DEFAULT_COLUMN_TYPE } from '../lib/constants';
import { stripName, getErrorMessage, hasError } from '../lib/utils';

// Type for table row data (dynamic based on schema)
interface TableRowData {
    id: string;
    [key: string]: any;
}

// Column metadata from schema
interface ColumnMeta {
    name: string;
    type: string;
    nullable: boolean;
}

export default function TableDetail() {
    const { tableId } = useParams<{ tableId: string }>();
    const navigate = useNavigate();
    const { token } = useAuth();

    // Table metadata
    const [table, setTable] = useState<TableRead | null>(null);
    const [loading, setLoading] = useState(true);
    const [totalRows, setTotalRows] = useState(0);

    // Schema/columns derived from table
    const [columnMeta, setColumnMeta] = useState<ColumnMeta[]>([]);

    // Column modal states
    const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
    const [isEditColumnModalOpen, setIsEditColumnModalOpen] = useState(false);

    // Column form states
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

    // Row form state
    const [newRowData, setNewRowData] = useState<Record<string, any>>({});

    // Confirmation modals
    const [deleteColumnConfirm, setDeleteColumnConfirm] = useState<{
        isOpen: boolean;
        columnName: string | null;
    }>({
        isOpen: false,
        columnName: null,
    });

    // Refresh trigger for DataTable
    const [refreshKey, setRefreshKey] = useState(0);

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
                setColumnMeta(cols);
            }
        } catch (error) {
            console.error('Failed to fetch table:', error);
            alert(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [token, tableId]);

    useEffect(() => {
        fetchTable();
    }, [fetchTable]);

    // API for DataTable
    const api: DataTableApi<TableRowData> = useMemo(() => ({
        fetch: async (params: FetchParams) => {
            if (!token || !tableId) {
                return { data: [], total: 0 };
            }

            const response = await getTableDataTablesTableIdDataGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                },
                query: {
                    page: params.page,
                    page_size: params.pageSize,
                    search: params.search || undefined,
                    sort_by: params.sortBy || undefined,
                    sort_order: params.sortOrder,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            const data = (response.data?.data || []) as TableRowData[];
            const total = response.data?.total || 0;
            setTotalRows(total);

            return { 
                data, 
                total,
                hasMore: data.length === params.pageSize,
            };
        },

        update: async (id: string, updates: Partial<TableRowData>) => {
            if (!tableId) throw new Error('No table ID');

            const response = await updateRowTablesTableIdDataRowIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    row_id: id,
                },
                body: updates,
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            return response.data as TableRowData;
        },

        delete: async (id: string) => {
            if (!tableId) throw new Error('No table ID');

            const response = await deleteRowTablesTableIdDataRowIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: tableId,
                    row_id: id,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }
        },
    }), [token, tableId]);

    // Build dynamic columns for DataGrid
    const columns: Column<TableRowData>[] = useMemo(() => {
        return columnMeta.map((col) => {
            const isIdColumn = col.name.toLowerCase() === 'id' && col.type.toLowerCase().includes('uuid');

            return {
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
                renderEditCell: isIdColumn ? undefined : textEditor,
                editable: !isIdColumn,
                renderCell: ({ row }: { row: TableRowData }) => {
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
            };
        });
    }, [columnMeta]);

    // Sort options from column metadata
    const sortOptions: SortOption[] = useMemo(() => [
        { value: '', label: 'None' },
        ...columnMeta.map((col) => ({
            value: col.name,
            label: col.name,
        })),
    ], [columnMeta]);

    // Export config
    const exportConfig: ExportConfig = useMemo(() => ({
        columns: columnMeta.map((col) => ({ key: col.name, name: col.name })),
        filename: `${table?.name || 'table'}_data_export.csv`,
    }), [columnMeta, table?.name]);

    // Column operations
    const openEditColumnModal = (col: ColumnMeta) => {
        setEditColumn({
            originalName: col.name,
            new_name: col.name,
            type: col.type,
            nullable: col.nullable,
        });
        setIsEditColumnModalOpen(true);
    };

    const handleAddColumn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId) return;

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
            setRefreshKey((k) => k + 1);
        } catch (error) {
            console.error('Failed to add column:', error);
            alert(getErrorMessage(error));
        }
    };

    const handleUpdateColumn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tableId) return;

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
            setRefreshKey((k) => k + 1);
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
            setRefreshKey((k) => k + 1);
        } catch (error) {
            console.error('Failed to delete column:', error);
            alert(getErrorMessage(error));
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="h-8 w-8 text-primary-400 animate-spin" />
            </div>
        );
    }

    // Not found state
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

    // No columns state
    if (columnMeta.length === 0) {
        return (
            <div>
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => navigate('/tables')}
                        className="p-2 text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <Settings className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{table.name}</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                            {table.description || 'No description'}
                        </p>
                    </div>
                </div>
                <div className="text-center py-12">
                    <p className="text-gray-500 dark:text-slate-400 mb-4">
                        No columns defined. Add your first column to get started.
                    </p>
                    <button
                        onClick={() => setIsAddColumnModalOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2 mx-auto"
                    >
                        <Plus className="h-4 w-4" />
                        New Column
                    </button>
                </div>

                {/* Add Column Modal */}
                <Modal isOpen={isAddColumnModalOpen} onClose={() => setIsAddColumnModalOpen(false)} title="Add Column">
                    <form onSubmit={handleAddColumn} className="space-y-4">
                        <div>
                            <Label>Column Name</Label>
                            <Input
                                type="text"
                                value={newColumn.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                placeholder="column_name"
                                required
                                hint="Lowercase letters, numbers, and underscores only"
                            />
                        </div>
                        <div>
                            <Label>Type</Label>
                            <Select
                                value={newColumn.type}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewColumn({ ...newColumn, type: e.target.value })}
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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, nullable: e.target.checked })}
                            label="Allow NULL values"
                        />
                        <div>
                            <Label>Default Value (optional)</Label>
                            <Input
                                type="text"
                                value={newColumn.default || ''}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, default: e.target.value || null })}
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
            </div>
        );
    }

    return (
        <div>
            <DataTable<TableRowData>
                key={refreshKey}
                columns={columns}
                api={api}
                title={table.name}
                entityName="row"
                sortOptions={sortOptions}
                exportConfig={exportConfig}
                paginationMode="infinite"
                pageSize={50}
                defaultSortBy={null}
                searchPlaceholder="Search data..."
                createButtonLabel="New Row"
                rowHeight={45}
                headerRowHeight={45}
                gridHeight="calc(100vh - 230px)"
                emptyMessage="No data yet. Click 'New Row' to insert data."
                backTo={{ path: '/tables', label: 'Back to Tables' }}
                headerActions={
                    <button
                        onClick={() => setIsAddColumnModalOpen(true)}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Column
                    </button>
                }
                renderSubheader={() => (
                    <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">
                        {table.description || 'No description'} •{' '}
                        <span className={table.public ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-slate-500'}>
                            {table.public ? 'Public' : 'Private'}
                        </span>{' '}
                        • {totalRows} rows
                    </p>
                )}
                renderCreateModal={({ isOpen, onClose, onSuccess }) => (
                    <Modal isOpen={isOpen} onClose={onClose} title="Add Row">
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!tableId) return;

                                try {
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

                                    setNewRowData({});
                                    onSuccess();
                                    fetchTable(); // Refresh row count
                                } catch (error) {
                                    console.error('Failed to add row:', error);
                                    alert(getErrorMessage(error));
                                }
                            }}
                            className="space-y-4"
                        >
                            {columnMeta
                                .filter((col) => !(col.name.toLowerCase() === 'id' && col.type.toLowerCase().includes('uuid')))
                                .map((col) => (
                                    <div key={col.name}>
                                        <Label required={!col.nullable}>{col.name}</Label>
                                        <Input
                                            type="text"
                                            value={newRowData[col.name] || ''}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRowData({ ...newRowData, [col.name]: e.target.value })}
                                            className="focus:ring-green-500"
                                            placeholder={col.type}
                                            required={!col.nullable}
                                        />
                                    </div>
                                ))}
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
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
                                >
                                    Add Row
                                </button>
                            </div>
                        </form>
                    </Modal>
                )}
            />

            {/* Add Column Modal */}
            <Modal isOpen={isAddColumnModalOpen} onClose={() => setIsAddColumnModalOpen(false)} title="Add Column">
                <form onSubmit={handleAddColumn} className="space-y-4">
                    <div>
                        <Label>Column Name</Label>
                        <Input
                            type="text"
                            value={newColumn.name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            placeholder="column_name"
                            required
                            hint="Lowercase letters, numbers, and underscores only"
                        />
                    </div>
                    <div>
                        <Label>Type</Label>
                        <Select
                            value={newColumn.type}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewColumn({ ...newColumn, type: e.target.value })}
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, nullable: e.target.checked })}
                        label="Allow NULL values"
                    />
                    <div>
                        <Label>Default Value (optional)</Label>
                        <Input
                            type="text"
                            value={newColumn.default || ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewColumn({ ...newColumn, default: e.target.value || null })}
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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditColumn({ ...editColumn, new_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                            required
                        />
                    </div>
                    <div>
                        <Label>Type</Label>
                        <Select
                            value={editColumn.type}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditColumn({ ...editColumn, type: e.target.value })}
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditColumn({ ...editColumn, nullable: e.target.checked })}
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
        </div>
    );
}
