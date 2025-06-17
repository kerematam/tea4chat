import { useContext } from "react";
import { NotificationContext } from "./NotificationContext";

// Custom hook to use notifications
export const useNotify = () => {
    const context = useContext(NotificationContext);

    if (context === undefined) {
        throw new Error('useNotify must be used within a NotificationProvider');
    }

    const { showNotification } = context;

    return {
        error: (message: string) => showNotification(message, 'error'),
        success: (message: string) => showNotification(message, 'success'),
        info: (message: string) => showNotification(message, 'info'),
        warning: (message: string) => showNotification(message, 'warning'),
    };
}; 