import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge class names with Tailwind CSS support.
 * Combines clsx for conditional classes and tailwind-merge for deduplication.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Strip leading and trailing whitespace from a string.
 */
export function stripName(name: string | null | undefined): string {
    return name?.trim() ?? '';
}

/**
 * Strip leading and trailing whitespace from all keys in an object.
 */
export function stripObjectKeys<T>(obj: Record<string, T>): Record<string, T> {
    return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => [key.trim(), value])
    );
}

/**
 * Error response type from the API.
 */
export interface ApiError {
    detail?: string | { msg: string; type: string }[];
}

/**
 * Extract error message from API response error.
 */
export function getErrorMessage(error: unknown): string {
    if (!error) return 'An unknown error occurred';
    
    // If it's a string, return it directly
    if (typeof error === 'string') return error;
    
    // If it has a detail property
    if (typeof error === 'object' && error !== null && 'detail' in error) {
        const apiError = error as ApiError;
        if (typeof apiError.detail === 'string') {
            return apiError.detail;
        }
        if (Array.isArray(apiError.detail) && apiError.detail.length > 0) {
            return apiError.detail.map(e => e.msg).join(', ');
        }
    }
    
    // If it has a message property (standard Error)
    if (typeof error === 'object' && error !== null && 'message' in error) {
        return (error as Error).message;
    }
    
    return 'An unknown error occurred';
}

/**
 * Type guard to check if response has an error.
 */
export function hasError<T, E>(
    response: { data?: T; error?: E }
): response is { data?: undefined; error: E } {
    return response.error !== undefined;
}
