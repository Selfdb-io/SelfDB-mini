/**
 * Utility functions for exporting data grid content to CSV
 * Based on Comcast/react-data-grid export patterns
 */

function serialiseCellValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    
    const stringValue = typeof value === 'object' 
        ? JSON.stringify(value) 
        : String(value);
    
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
}

function downloadFile(fileName: string, blob: Blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
}

/**
 * Export data grid content to CSV from DOM element
 * Uses the grid's rendered content to ensure accurate export
 */
export function exportGridToCsv(gridEl: HTMLDivElement, fileName: string) {
    const { head, body } = getGridContent(gridEl);
    const content = [...head, ...body]
        .map((cells) => cells.map(serialiseCellValue).join(','))
        .join('\n');

    downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}

function getGridContent(gridEl: HTMLDivElement) {
    return {
        head: getRows('.rdg-header-row'),
        body: getRows('.rdg-row:not(.rdg-summary-row)')
    };

    function getRows(selector: string) {
        return Array.from(gridEl.querySelectorAll<HTMLDivElement>(selector)).map((rowEl) => {
            return Array.from(rowEl.querySelectorAll<HTMLDivElement>('.rdg-cell')).map((cellEl) => {
                return cellEl.textContent ?? '';
            });
        });
    }
}

/**
 * Export rows data directly to CSV (more reliable, doesn't depend on DOM)
 * @param columns - Array of column definitions with key and name
 * @param rows - Array of row data objects
 * @param fileName - Name for the downloaded file
 */
export function exportDataToCsv<T extends Record<string, unknown>>(
    columns: Array<{ key: string; name: string }>,
    rows: T[],
    fileName: string
) {
    // Filter out selection and actions columns
    const exportColumns = columns.filter(
        (col) => col.key !== 'select' && col.key !== 'actions' && col.key !== 'select-row'
    );
    
    // Create header row
    const header = exportColumns.map((col) => serialiseCellValue(col.name)).join(',');
    
    // Create data rows
    const dataRows = rows.map((row) =>
        exportColumns.map((col) => serialiseCellValue(row[col.key])).join(',')
    );
    
    const content = [header, ...dataRows].join('\n');
    downloadFile(fileName, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
}
