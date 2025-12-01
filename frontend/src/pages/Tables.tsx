import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { textEditor, type Column, type RenderEditCellProps } from 'react-data-grid';
import { Plus, Trash2, Database } from 'lucide-react';
import {
    readTablesTablesGet,
    createTableTablesPost,
    updateTableTablesTableIdPatch,
    deleteTableTablesTableIdDelete,
} from '../client/sdk.gen';
import type { TableRead } from '../client/types.gen';
import { useAuth } from '../context/AuthContext';
import { API_KEY } from '../lib/api';
import {
    Modal,
    Input,
    Textarea,
    Select,
    Checkbox,
    Label,
    DataTable,
    type DataTableApi,
    type SortOption,
    type ExportConfig,
} from '../components';
import { DATA_TYPES } from '../lib/constants';
import { stripName, getErrorMessage, hasError } from '../lib/utils';
import { formatDate } from '../lib/formatDate';

type TableRow = TableRead;

const PAGE_SIZE = 50;

// Sort options for the dropdown
const SORT_OPTIONS: SortOption[] = [
    { value: 'created_at', label: 'Created Date' },
    { value: 'updated_at', label: 'Updated Date' },
    { value: 'name', label: 'Name' },
];

// Export configuration
const EXPORT_CONFIG: ExportConfig = {
    columns: [
        { key: 'id', name: 'ID' },
        { key: 'name', name: 'Name' },
        { key: 'description', name: 'Description' },
        { key: 'public', name: 'Public' },
        { key: 'row_count', name: 'Row Count' },
        { key: 'created_at', name: 'Created At' },
        { key: 'updated_at', name: 'Updated At' },
    ],
    filename: 'tables.csv',
};

export default function Tables() {
    const { token } = useAuth();
    const navigate = useNavigate();

    // Create modal state
    const [createForm, setCreateForm] = useState({
        name: '',
        description: '',
        public: false,
        columns: [{ name: 'id', type: 'uuid', nullable: false }],
    });

    // API operations for DataTable
    const api: DataTableApi<TableRow> = useMemo(() => ({
        fetch: async ({ page, pageSize, search, sortBy, sortOrder }) => {
            if (!token) {
                return { data: [], hasMore: false };
            }

            const skip = (page - 1) * pageSize;
            const response = await readTablesTablesGet({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                query: {
                    skip,
                    limit: pageSize,
                    search: search || undefined,
                    sort_by: sortBy as 'created_at' | 'updated_at' | 'name' | undefined,
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
            const response = await updateTableTablesTableIdPatch({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: id,
                },
                body: {
                    name: data.name || undefined,
                    description: data.description || null,
                    public: data.public,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }

            return response.data as TableRow;
        },

        delete: async (id) => {
            const response = await deleteTableTablesTableIdDelete({
                headers: {
                    'X-API-Key': API_KEY,
                    Authorization: `Bearer ${token}`,
                },
                path: {
                    table_id: id,
                },
            });

            if (hasError(response)) {
                throw new Error(getErrorMessage(response.error));
            }
        },
    }), [token]);

    // Column definitions with inline editing
    const columns: Column<TableRow>[] = useMemo(() => [
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
            key: 'name', 
            name: 'Name', 
            resizable: true, 
            minWidth: 200,
            renderCell: ({ row }) => (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tables/${row.id}`);
                    }}
                    className="flex items-center gap-2 hover:text-primary-400 transition-colors"
                >
                    <Database className="h-4 w-4 text-primary-400" />
                    <span className="font-medium">{row.name}</span>
                </button>
            ),
            renderEditCell: textEditor
        },
        { 
            key: 'description', 
            name: 'Description', 
            resizable: true, 
            minWidth: 200,
            renderCell: ({ row }) => row.description || <span className="text-gray-500 dark:text-slate-500">No description</span>,
            renderEditCell: textEditor
        },
        { 
            key: 'public', 
            name: 'Visibility', 
            resizable: true, 
            minWidth: 120,
            renderCell: ({ row }) => (
                <span
                    className={`px-2 py-1 rounded-full text-xs ${
                        row.public ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-500/10 dark:bg-slate-500/10 text-gray-500 dark:text-slate-400'
                    }`}
                >
                    {row.public ? 'Public' : 'Private'}
                </span>
            ),
            renderEditCell: ({ row, onRowChange }: RenderEditCellProps<TableRow>) => (
                <select
                    className="w-full h-full px-2 bg-white dark:bg-slate-800 border-0 text-gray-900 dark:text-white focus:outline-none"
                    value={row.public ? 'true' : 'false'}
                    onChange={(e) => onRowChange({ ...row, public: e.target.value === 'true' }, true)}
                    autoFocus
                >
                    <option value="true">Public</option>
                    <option value="false">Private</option>
                </select>
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
    ], [navigate]);

    // Column management for create form
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

    // Handle create table form submission
    const handleCreateTable = async (onSuccess: () => void) => {
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

            setCreateForm({
                name: '',
                description: '',
                public: false,
                columns: [{ name: 'id', type: 'uuid', nullable: false }],
            });
            onSuccess();
        } catch (error) {
            alert(getErrorMessage(error));
        }
    };

    return (
        <DataTable<TableRow>
            columns={columns}
            api={api}
            title="Table Management"
            entityName="table"
            sortOptions={SORT_OPTIONS}
            exportConfig={EXPORT_CONFIG}
            pageSize={PAGE_SIZE}
            defaultSortBy="created_at"
            defaultSortOrder="desc"
            searchPlaceholder="Search by name or description..."
            createButtonLabel="Create Table"
            emptyMessage="No tables found"
            loadingMessage="Loading tables..."
            renderCreateModal={({ isOpen, onClose, onSuccess }) => (
                <Modal
                    isOpen={isOpen}
                    onClose={onClose}
                    title="Create New Table"
                >
                    <form 
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleCreateTable(onSuccess);
                        }} 
                        className="space-y-4"
                    >
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
                                onClick={onClose}
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
            )}
        />
    );
}
