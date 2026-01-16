"use client";

import * as React from 'react';
import { AlertDialog } from './ui/dialog';

export type DialogType = 'confirm' | 'alert' | 'prompt';

export interface DialogConfig {
  id: string;
  type: DialogType;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'default' | 'destructive';
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

interface DialogManagerContextType {
  dialogs: DialogConfig[];
  openDialog: (config: Omit<DialogConfig, 'id'>) => string;
  closeDialog: (id: string) => void;
  closeAllDialogs: () => void;
}

const DialogManagerContext = React.createContext<DialogManagerContextType | undefined>(undefined);

export const useDialogManager = () => {
  const context = React.useContext(DialogManagerContext);
  if (!context) {
    throw new Error('useDialogManager must be used within a DialogManagerProvider');
  }
  return context;
};

export const DialogManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogs, setDialogs] = React.useState<DialogConfig[]>([]);

  const openDialog = React.useCallback((config: Omit<DialogConfig, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 11);
    const newDialog: DialogConfig = { ...config, id };
    setDialogs(prev => [...prev, newDialog]);
    return id;
  }, []);

  const closeDialog = React.useCallback((id: string) => {
    setDialogs(prev => prev.filter(dialog => dialog.id !== id));
  }, []);

  const closeAllDialogs = React.useCallback(() => {
    setDialogs([]);
  }, []);

  const value = React.useMemo(
    () => ({ dialogs, openDialog, closeDialog, closeAllDialogs }),
    [dialogs, openDialog, closeDialog, closeAllDialogs]
  );

  return (
    <DialogManagerContext.Provider value={value}>
      {children}
      {dialogs.map(dialog => (
        <AlertDialog
          key={dialog.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              closeDialog(dialog.id);
            }
          }}
          title={dialog.title}
          description={dialog.description}
          confirmText={dialog.confirmText}
          cancelText={dialog.cancelText}
          onConfirm={dialog.onConfirm || (() => closeDialog(dialog.id))}
          variant={dialog.variant || 'default'}
          confirmVariant={dialog.confirmVariant || 'default'}
          loading={dialog.loading || false}
        />
      ))}
    </DialogManagerContext.Provider>
  );
};

// Convenience hooks for common dialog types
export const useConfirmDialog = () => {
  const { openDialog, closeDialog } = useDialogManager();

  return React.useCallback((config: {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'default' | 'destructive';
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  }) => {
    const id = openDialog({
      type: 'confirm',
      ...config,
    });
    return () => closeDialog(id);
  }, [openDialog, closeDialog]);
};

export const useAlertDialog = () => {
  const { openDialog, closeDialog } = useDialogManager();

  return React.useCallback((config: {
    title: string;
    description?: string;
    confirmText?: string;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
    onConfirm?: () => void;
  }) => {
    const id = openDialog({
      type: 'alert',
      confirmText: config.confirmText || 'OK',
      ...config,
    });
    return () => closeDialog(id);
  }, [openDialog, closeDialog]);
};

export default DialogManagerProvider;