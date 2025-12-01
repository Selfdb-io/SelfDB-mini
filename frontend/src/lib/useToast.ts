import { useState, useCallback } from 'react';
import type { ToastMessage, ToastType } from '../components/Toast';

export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((type: ToastType, message: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts((prev) => [...prev, { id, type, message }]);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showSuccess = useCallback((message: string) => addToast('success', message), [addToast]);
    const showError = useCallback((message: string) => addToast('error', message), [addToast]);
    const showInfo = useCallback((message: string) => addToast('info', message), [addToast]);

    return {
        toasts,
        dismissToast,
        showSuccess,
        showError,
        showInfo,
    };
}
