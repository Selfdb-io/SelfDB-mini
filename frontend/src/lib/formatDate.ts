/**
 * Format a date string into a human-readable format.
 * @param dateString - ISO date string or null/undefined
 * @returns Formatted date string or em-dash for null/undefined
 */
export function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
