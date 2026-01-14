import { useState, useEffect } from 'react';

export const SIDEBAR_STORAGE_KEY = 'bernard-chat-sidebar-open';

export function useSidebarState() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (saved !== null) {
          const parsed = JSON.parse(saved);
          return typeof parsed === 'boolean' ? parsed : true;
        }
      } catch {
        // Ignore malformed data, fall through to default
      }
    }
    return true;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isOpen));
    }
  }, [isOpen]);

  return [isOpen, setIsOpen] as const;
}
