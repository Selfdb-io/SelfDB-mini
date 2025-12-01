import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '../../lib/useToast';
import { exportDataToCsv } from '../../lib/exportUtils';
import { getErrorMessage } from '../../lib/utils';
import type {
    UseDataTableOptions,
    UseDataTableReturn,
    FetchParams,
} from './types';

const DEFAULT_PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

/**
 * Custom hook that provides all the shared logic for data tables.
 * Handles loading, pagination, search, sort, selection, inline editing,
 * bulk operations, and toast notifications.
 */
export function useDataTable<T extends { id: string }>(
    options: UseDataTableOptions<T>
): UseDataTableReturn<T> {
    const {
        api,
        pageSize = DEFAULT_PAGE_SIZE,
        defaultSortBy = null,
        defaultSortOrder = 'desc',
        entityName,
        exportConfig,
        paginationMode = 'infinite',
    } = options;

    // Toast notifications
    const { toasts, dismissToast, showSuccess, showError } = useToast();

    // Data state
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [totalRows, setTotalRows] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);

    // Selection state
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(() => new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

    // Search and sort state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortByState] = useState<string | null>(defaultSortBy);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * Fetch data from API
     */
    const fetchData = useCallback(
        async (pageNum: number = 1, append: boolean = false) => {
            try {
                if (pageNum === 1) {
                    setLoading(true);
                } else {
                    setIsLoadingMore(true);
                }

                const params: FetchParams = {
                    page: pageNum,
                    pageSize,
                    search: searchQuery || undefined,
                    sortBy: sortBy || undefined,
                    sortOrder,
                };

                const response = await api.fetch(params);

                if (response.data) {
                    if (append && paginationMode === 'infinite') {
                        setData((prev) => [...prev, ...response.data]);
                    } else {
                        setData(response.data);
                    }

                    if (response.total !== undefined) {
                        setTotalRows(response.total);
                    }

                    if (response.hasMore !== undefined) {
                        setHasMore(response.hasMore);
                    } else {
                        // Infer hasMore from response length
                        setHasMore(response.data.length === pageSize);
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch ${entityName}s:`, error);
                showError(getErrorMessage(error));
            } finally {
                setLoading(false);
                setIsLoadingMore(false);
            }
        },
        [api, pageSize, searchQuery, sortBy, sortOrder, entityName, paginationMode, showError]
    );

    /**
     * Refresh data (fetch from page 1)
     */
    const refresh = useCallback(() => {
        setPage(1);
        setSelectedRows(new Set());
        fetchData(1, false);
    }, [fetchData]);

    /**
     * Handle search input with debounce
     */
    const handleSearchChange = useCallback((value: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            setSearchQuery(value);
            setPage(1);
        }, DEBOUNCE_MS);
    }, []);

    /**
     * Clear search
     */
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setPage(1);
    }, []);

    /**
     * Set sort by field
     */
    const setSortBy = useCallback((value: string | null) => {
        setSortByState(value);
        setPage(1);
    }, []);

    /**
     * Toggle sort order
     */
    const toggleSortOrder = useCallback(() => {
        setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
        setPage(1);
    }, []);

    /**
     * Handle infinite scroll
     */
    const handleScroll = useCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            if (paginationMode !== 'infinite') return;

            const target = event.currentTarget;
            const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

            if (scrollBottom < 100 && hasMore && !isLoadingMore) {
                const nextPage = page + 1;
                setPage(nextPage);
                fetchData(nextPage, true);
            }
        },
        [paginationMode, hasMore, isLoadingMore, page, fetchData]
    );

    /**
     * Handle inline row changes with optimistic update
     */
    const handleRowsChange = useCallback(
        async (rows: T[], { indexes }: { indexes: number[] }) => {
            if (indexes.length === 0) return;

            // Optimistic update
            setData(rows);

            for (const index of indexes) {
                const row = rows[index];
                if (!row) continue;

                const originalRow = data[index];
                if (!originalRow || row.id !== originalRow.id) continue;

                // Find what changed (excluding id)
                const updates: Partial<T> = {};
                (Object.keys(row) as Array<keyof T>).forEach((key) => {
                    if (key !== 'id' && row[key] !== originalRow[key]) {
                        updates[key] = row[key];
                    }
                });

                if (Object.keys(updates).length === 0) continue;

                try {
                    await api.update(row.id, updates);
                    showSuccess(`${entityName} updated successfully`);
                } catch (error) {
                    console.error(`Failed to update ${entityName}:`, error);
                    showError(getErrorMessage(error));
                    // Revert on error
                    fetchData(page, false);
                }
            }
        },
        [api, data, entityName, page, fetchData, showSuccess, showError]
    );

    /**
     * Handle bulk delete
     */
    const handleBulkDelete = useCallback(async () => {
        if (selectedRows.size === 0) return;

        setIsBulkDeleting(true);
        try {
            const deletePromises = Array.from(selectedRows).map((id) => api.delete(id));
            await Promise.all(deletePromises);

            showSuccess(`${selectedRows.size} ${entityName}${selectedRows.size === 1 ? '' : 's'} deleted`);
            setSelectedRows(new Set());
            setBulkDeleteConfirm(false);
            setPage(1);
            fetchData(1, false);
        } catch (error) {
            console.error(`Failed to delete ${entityName}s:`, error);
            showError(getErrorMessage(error));
        } finally {
            setIsBulkDeleting(false);
        }
    }, [selectedRows, api, entityName, fetchData, showSuccess, showError]);

    /**
     * Export selected rows to CSV
     */
    const handleExportCsv = useCallback(() => {
        const rowsToExport = selectedRows.size > 0
            ? data.filter((row) => selectedRows.has(row.id))
            : data;

        const filename = typeof exportConfig.filename === 'function'
            ? exportConfig.filename(selectedRows.size)
            : exportConfig.filename;

        exportDataToCsv(exportConfig.columns, rowsToExport, filename);
    }, [selectedRows, data, exportConfig]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    // Fetch data when search, sort, or page changes
    useEffect(() => {
        fetchData(page, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchQuery, sortBy, sortOrder]);

    return {
        // Data state
        data,
        setData,
        loading,
        isLoadingMore,
        totalRows,
        hasMore,
        page,
        setPage,

        // Selection state
        selectedRows,
        setSelectedRows,
        isBulkDeleting,
        bulkDeleteConfirm,
        setBulkDeleteConfirm,

        // Search/sort state
        searchQuery,
        sortBy,
        sortOrder,
        setSortBy,

        // Actions
        refresh,
        handleSearchChange,
        clearSearch,
        toggleSortOrder,
        handleScroll,
        handleRowsChange,
        handleBulkDelete,
        handleExportCsv,

        // Toast helpers
        showSuccess,
        showError,
        toasts,
        dismissToast,
    };
}
