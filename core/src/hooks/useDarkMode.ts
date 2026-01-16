"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type DarkModeContextType = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

type DarkModeProviderProps = {
  children: ReactNode;
};

export function DarkModeProvider({ children }: DarkModeProviderProps) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // On client mount, read from localStorage or system preference
  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem('darkMode');
      if (savedPreference !== null) {
        setIsDarkMode(savedPreference === 'true');
      } else {
        // Default to system preference only after hydration
        setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    } catch {
      setIsDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    setIsHydrated(true);
  }, []);

  // Apply dark mode class and save preference
  useEffect(() => {
    if (!isHydrated) return;
    
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    try {
      localStorage.setItem('darkMode', isDarkMode.toString());
    } catch (error) {
      console.warn('Failed to save dark mode preference to localStorage:', error);
    }
  }, [isDarkMode, isHydrated]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  const value = {
    isDarkMode,
    toggleDarkMode
  };

  return React.createElement(DarkModeContext.Provider, { value }, children);
}

export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
}
