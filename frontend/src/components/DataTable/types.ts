import type { Column } from 'react-data-grid';
import type { ReactNode } from 'react';

/**
 * Parameters for fetching data
 */
export interface FetchParams {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: string | null;
    sortOrder?: 'asc' | 'desc';
}

/**
 * Response from fetch operation
 */
export interface FetchResponse<T> {
    data: T[];
    total?: number;
    hasMore?: boolean;
}

/**
 * API operations for the data table
 */
export interface DataTableApi<T> {
    /** Fetch data with pagination, search, and sort */
    fetch: (params: FetchParams) => Promise<FetchResponse<T>>;
    /** Update a single row */
    update: (id: string, data: Partial<T>) => Promise<T>;
    /** Delete a single row */
    delete: (id: string) => Promise<void>;
}

/**
 * Sort dropdown option
 */
export interface SortOption {
    value: string;
    label: string;
}

/**
 * Export configuration
 */
export interface ExportConfig {
    /** Columns to include in export */
    columns: Array<{ key: string; name: string }>;
    /** Filename or function to generate filename */
    filename: string | ((selectedCount: number) => string);
}

/**
 * Back navigation configuration (for detail mode)
 */
export interface BackNavigation {
    path: string;
    label?: string;
}

/**
 * Pagination mode
 */
export type PaginationMode = 'infinite' | 'pages';

/**
 * Main DataTable component props
 */
export interface DataTableProps<T extends { id: string }> {
    // === Required Props ===
    
    /** Column definitions for react-data-grid */
    columns: Column<T>[];
    
    /** API operations for CRUD */
    api: DataTableApi<T>;
    
    /** Page title */
    title: string;
    
    /** Entity name for messages (e.g., "user", "table", "row") */
    entityName: string;
    
    /** Sort options for the dropdown */
    sortOptions: SortOption[];
    
    /** Export configuration */
    exportConfig: ExportConfig;

    // === Optional Props ===
    
    /** Custom row key getter. Defaults to (row) => row.id */
    rowKeyGetter?: (row: T) => string;
    
    /** Pagination mode. Defaults to 'infinite' */
    paginationMode?: PaginationMode;
    
    /** Page size. Defaults to 50 */
    pageSize?: number;
    
    /** Default sort field */
    defaultSortBy?: string | null;
    
    /** Default sort order. Defaults to 'desc' */
    defaultSortOrder?: 'asc' | 'desc';
    
    /** Search input placeholder */
    searchPlaceholder?: string;
    
    /** Enable search. Defaults to true */
    searchEnabled?: boolean;
    
    /** Label for create button */
    createButtonLabel?: string;
    
    /** Render create modal content */
    renderCreateModal?: (props: {
        isOpen: boolean;
        onClose: () => void;
        onSuccess: () => void;
    }) => ReactNode;
    
    /** Handler for row click (for list mode navigation) */
    onRowClick?: (row: T) => void;
    
    /** Additional header actions */
    headerActions?: ReactNode;
    
    /** Content to render above the grid (e.g., metadata) */
    renderSubheader?: () => ReactNode;
    
    /** Back navigation config (for detail mode) */
    backTo?: BackNavigation;
    
    /** Total row count for page-based pagination */
    totalRows?: number;
    
    // === Grid Configuration ===
    
    /** Row height. Defaults to 45 */
    rowHeight?: number;
    
    /** Header row height. Defaults to 45 */
    headerRowHeight?: number;
    
    /** Grid height. Defaults to 'calc(100vh - 240px)' */
    gridHeight?: string;
    
    /** Empty state message */
    emptyMessage?: string;
    
    /** Loading state message */
    loadingMessage?: string;
}

/**
 * Props for the useDataTable hook
 */
export interface UseDataTableOptions<T extends { id: string }> {
    api: DataTableApi<T>;
    pageSize?: number;
    defaultSortBy?: string | null;
    defaultSortOrder?: 'asc' | 'desc';
    entityName: string;
    exportConfig: ExportConfig;
    paginationMode?: PaginationMode;
}

/**
 * Return type for useDataTable hook
 */
export interface UseDataTableReturn<T> {
    // Data state
    data: T[];
    setData: React.Dispatch<React.SetStateAction<T[]>>;
    loading: boolean;
    isLoadingMore: boolean;
    totalRows: number;
    hasMore: boolean;
    page: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    
    // Selection state
    selectedRows: ReadonlySet<string>;
    setSelectedRows: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
    isBulkDeleting: boolean;
    bulkDeleteConfirm: boolean;
    setBulkDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
    
    // Search/sort state
    searchQuery: string;
    sortBy: string | null;
    sortOrder: 'asc' | 'desc';
    setSortBy: (value: string | null) => void;
    
    // Actions
    refresh: () => void;
    handleSearchChange: (value: string) => void;
    clearSearch: () => void;
    toggleSortOrder: () => void;
    handleScroll: (event: React.UIEvent<HTMLDivElement>) => void;
    handleRowsChange: (rows: T[], info: { indexes: number[] }) => Promise<void>;
    handleBulkDelete: () => Promise<void>;
    handleExportCsv: () => void;
    
    // Toast helpers
    showSuccess: (msg: string) => void;
    showError: (msg: string) => void;
    toasts: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>;
    dismissToast: (id: string) => void;
}

/**
 * Props for SearchBar component
 */
export interface SearchBarProps {
    placeholder?: string;
    onSearchChange: (value: string) => void;
    onClear: () => void;
    disabled?: boolean;
}

/**
 * Props for SortControls component
 */
export interface SortControlsProps {
    sortOptions: SortOption[];
    sortBy: string | null;
    sortOrder: 'asc' | 'desc';
    onSortByChange: (value: string | null) => void;
    onToggleSortOrder: () => void;
    disabled?: boolean;
}

/**
 * Props for TableHeader component
 */
export interface TableHeaderProps {
    title: string;
    backTo?: BackNavigation;
    onRefresh: () => void;
    onCreateClick?: () => void;
    createButtonLabel?: string;
    isLoading?: boolean;
    additionalActions?: ReactNode;
}
