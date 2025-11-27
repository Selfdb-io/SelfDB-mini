import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDangerous?: boolean;
}

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDangerous = false,
}: ConfirmationModalProps) {
    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                {isDangerous && (
                    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-700 dark:text-red-300">This action cannot be undone.</p>
                    </div>
                )}
                <p className="text-gray-600 dark:text-slate-300 text-sm">{message}</p>
                <div className="flex justify-end gap-2 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-transparent text-gray-700 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className={`px-4 py-2 rounded-lg transition-colors ${isDangerous
                                ? 'bg-red-600 text-white hover:bg-red-500'
                                : 'bg-primary-600 text-white hover:bg-primary-500'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
