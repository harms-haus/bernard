"use client";

import * as React from 'react';
import { ToastProvider, ToastViewport, Toast } from './ui/toast';

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface ToastConfig {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  duration?: number;
}

interface ToastManagerContextType {
  toasts: ToastConfig[];
  showToast: (config: Omit<ToastConfig, 'id'>) => string;
  hideToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastManagerContext = React.createContext<ToastManagerContextType | undefined>(undefined);

export const useToastManager = () => {
  const context = React.useContext(ToastManagerContext);
  if (!context) {
    throw new Error('useToastManager must be used within a ToastManagerProvider');
  }
  return context;
};

export const ToastManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastConfig[]>([]);

  const showToast = React.useCallback((config: Omit<ToastConfig, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 11);
    const newToast: ToastConfig = { ...config, id };
    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const hideToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearToasts = React.useCallback(() => {
    setToasts([]);
  }, []);

  const value = React.useMemo(
    () => ({ toasts, showToast, hideToast, clearToasts }),
    [toasts, showToast, hideToast, clearToasts]
  );

  return (
    <ToastManagerContext.Provider value={value}>
      {children}
      <ToastProvider>
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            title={toast.title}
            description={toast.description}
            action={toast.action}
            duration={toast.duration}
            onOpenChange={(open) => {
              if (!open) {
                hideToast(toast.id);
              }
            }}
          />
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastManagerContext.Provider>
  );
};

// Convenience hooks for common toast types
export const useToast = () => {
  const { showToast, hideToast } = useToastManager();

  const show = React.useCallback((config: Omit<ToastConfig, 'id'>) => {
    const id = showToast(config);
    return () => hideToast(id);
  }, [showToast, hideToast]);

  const success = React.useCallback((title: string, description?: React.ReactNode, duration?: number) => {
    return show({ variant: 'success', title, description, duration });
  }, [show]);

  const error = React.useCallback((title: string, description?: React.ReactNode, duration?: number) => {
    return show({ variant: 'error', title, description, duration });
  }, [show]);

  const warning = React.useCallback((title: string, description?: React.ReactNode, duration?: number) => {
    return show({ variant: 'warning', title, description, duration });
  }, [show]);

  const info = React.useCallback((title: string, description?: React.ReactNode, duration?: number) => {
    return show({ variant: 'info', title, description, duration });
  }, [show]);

  const message = React.useCallback((title: string, description?: React.ReactNode, variant: ToastVariant = 'default', duration?: number) => {
    return show({ variant, title, description, duration });
  }, [show]);

  return {
    show,
    success,
    error,
    warning,
    info,
    message
  };
};

export default ToastManagerProvider;