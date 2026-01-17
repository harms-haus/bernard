'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type HeaderContextValue = {
  title: string;
  subtitle: string | null;
  setTitle: (title: string) => void;
  setSubtitle: (subtitle: string | null) => void;
  reset: () => void;
};

const HeaderContext = createContext<HeaderContextValue | null>(null);

export function HeaderProvider({ children, defaultTitle = 'Bernard' }: { children: ReactNode; defaultTitle?: string }) {
  const [title, setTitleState] = useState(defaultTitle);
  const [subtitle, setSubtitleState] = useState<string | null>(null);

  const setTitle = (newTitle: string) => {
    setTitleState(newTitle);
  };

  const setSubtitle = (newSubtitle: string | null) => {
    setSubtitleState(newSubtitle);
  };

  const reset = () => {
    setTitleState(defaultTitle);
    setSubtitleState(null);
  };

  return (
    <HeaderContext.Provider value={{ title, subtitle, setTitle, setSubtitle, reset }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeaderService() {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeaderService must be used within a HeaderProvider');
  }
  return context;
}
