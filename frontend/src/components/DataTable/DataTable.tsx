import { useState } from 'react';
import { DataGrid, SelectColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import BulkActionsToolbar from '../BulkActionsToolbar';
import ConfirmationModal from '../ConfirmationModal';
import { ToastContainer } from '../Toast';
import { SearchBar } from './SearchBar';
import { SortControls } from './SortControls';
import { TableHeader } from './TableHeader';
import { useDataTable } from './useDataTable';
import type { DataTableProps } from './types';

/**
 * Generic reusable data table component.
 * Supports both "list" mode (infinite scroll) and "detail" mode (page-based pagination).
 */
export function DataTable<T extends { id: string }>({
    // Required props
    columns,
    api,
    title,
    entityName,
    sortOptions,
    exportConfig,
    
    // Optional props with defaults
    rowKeyGetter = (row) => row.id,
    paginationMode = 'infinite',
    pageSize = 50,
    defaultSortBy = sortOptions[0]?.value ?? null,
    defaultSortOrder = 'desc',
    searchPlaceholder = 'Search...',
    searchEnabled = true,
    createButtonLabel,
    renderCreateModal,
    onRowClick,
    headerActions,
    renderSubheader,
    backTo,
    totalRows: externalTotalRows,
    rowHeight = 45,
    headerRowHeight = 45,
    gridHeight = 'calc(100vh - 200px)',
    emptyMessage = `No ${entityName}s found`,
    loadingMessage = `Loading ${entityName}s...`,
}: DataTableProps<T>) {
    const { theme } = useTheme();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Use the shared data table hook
    const {
        data,
        loading,
        isLoadingMore,
        totalRows: hookTotalRows,
        page,
        setPage,
        selectedRows,
        setSelectedRows,
        isBulkDeleting,
        bulkDeleteConfirm,
        setBulkDeleteConfirm,
        searchQuery,
        sortBy,
        sortOrder,
        setSortBy,
        refresh,
        handleSearchChange,
        clearSearch,
        toggleSortOrder,
        handleScroll,
        handleRowsChange,
        handleBulkDelete,
        handleExportCsv,
        toasts,
        dismissToast,
    } = useDataTable({
        api,
        pageSize,
        defaultSortBy,
        defaultSortOrder,
        entityName,
        exportConfig,
        paginationMode,
    });

    const totalRows = externalTotalRows ?? hookTotalRows;
    const totalPages = Math.ceil(totalRows / pageSize);

    // Add SelectColumn to the beginning if not already present
    const gridColumns = columns[0]?.key === 'select-row' 
        ? columns 
        : [SelectColumn, ...columns];

    const handleCreateSuccess = () => {
        setIsCreateModalOpen(false);
        refresh();
    };

    return (
        <div>
            {/* Header */}
            <TableHeader
                title={title}
                backTo={backTo}
                onRefresh={refresh}
                onCreateClick={renderCreateModal ? () => setIsCreateModalOpen(true) : undefined}
                createButtonLabel={createButtonLabel}
                isLoading={loading}
                additionalActions={headerActions}
            />

            {/* Subheader (optional) */}
            {renderSubheader?.()}

            {/* Search and Sort Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
                {searchEnabled && (
                    <SearchBar
                        placeholder={searchPlaceholder}
                        onSearchChange={handleSearchChange}
                        onClear={clearSearch}
                        disabled={loading}
                    />
                )}
                <SortControls
                    sortOptions={sortOptions}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortByChange={setSortBy}
                    onToggleSortOrder={toggleSortOrder}
                    disabled={loading}
                />
            </div>

            {/* Active Search Indicator */}
            {searchQuery && (
                <div className="mb-4 text-sm text-gray-500 dark:text-slate-400">
                    Showing results for:{' '}
                    <span className="font-medium text-gray-900 dark:text-white">"{searchQuery}"</span>
                </div>
            )}

            {/* Bulk Actions Toolbar */}
            <BulkActionsToolbar
                selectedCount={selectedRows.size}
                onDelete={() => setBulkDeleteConfirm(true)}
                onExport={handleExportCsv}
                onClearSelection={() => setSelectedRows(new Set())}
                isDeleting={isBulkDeleting}
            />

            {/* Data Grid */}
            {loading ? (
                <div className="text-gray-900 dark:text-white text-center py-12">
                    {loadingMessage}
                </div>
            ) : (
                <>
                    <DataGrid
                        columns={gridColumns}
                        rows={data}
                        rowKeyGetter={rowKeyGetter}
                        selectedRows={selectedRows}
                        onSelectedRowsChange={setSelectedRows}
                        onRowsChange={handleRowsChange}
                        className={theme === 'dark' ? 'rdg-dark' : 'rdg-light'}
                        onScroll={paginationMode === 'infinite' ? handleScroll : undefined}
                        rowHeight={rowHeight}
                        headerRowHeight={headerRowHeight}
                        style={{ height: gridHeight }}
                        onCellClick={(args) => {
                            // If the column is editable, enable single-click editing
                            if (args.column.editable) {
                                args.selectCell(true);
                            } else if (onRowClick) {
                                // If there's a row click handler and column is not editable, navigate
                                onRowClick(args.row);
                            }
                        }}
                        renderers={{
                            noRowsFallback: (
                                <div 
                                    className="flex items-center justify-center text-gray-500 dark:text-slate-400"
                                    style={{ 
                                        gridColumn: '1 / -1',
                                        textAlign: 'center',
                                        padding: '3rem 1rem',
                                    }}
                                >
                                    {emptyMessage}
                                </div>
                            ),
                        }}
                    />

                    {/* Infinite scroll loading indicator */}
                    {paginationMode === 'infinite' && isLoadingMore && (
                        <div className="text-center py-4 text-gray-500 dark:text-slate-400">
                            Loading more...
                        </div>
                    )}

                    {/* Page-based pagination controls */}
                    {paginationMode === 'pages' && totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 px-2">
                            <div className="text-sm text-gray-500 dark:text-slate-400">
                                Showing {(page - 1) * pageSize + 1} to{' '}
                                {Math.min(page * pageSize, totalRows)} of {totalRows} {entityName}s
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </button>
                                <span className="text-sm text-gray-600 dark:text-slate-400 px-3">
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Create Modal */}
            {renderCreateModal?.({
                isOpen: isCreateModalOpen,
                onClose: () => setIsCreateModalOpen(false),
                onSuccess: handleCreateSuccess,
            })}

            {/* Bulk Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={bulkDeleteConfirm}
                onClose={() => setBulkDeleteConfirm(false)}
                onConfirm={handleBulkDelete}
                title={`Delete Selected ${entityName}${selectedRows.size === 1 ? '' : 's'}`}
                message={`Are you sure you want to delete ${selectedRows.size} selected ${entityName}${selectedRows.size === 1 ? '' : 's'}? This action cannot be undone.`}
                confirmText={isBulkDeleting ? 'Deleting...' : `Delete ${selectedRows.size} ${entityName}${selectedRows.size === 1 ? '' : 's'}`}
                isDangerous={true}
            />

            {/* Toast Notifications */}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
}
