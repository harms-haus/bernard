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
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Check localStorage for saved preference
    if (typeof window !== 'undefined') {
      try {
        const savedPreference = localStorage.getItem('darkMode');
        if (savedPreference !== null) {
          return savedPreference === 'true';
        }
      } catch (error) {
        // localStorage access failed, fall through to system preference
      }
      // Default to system preference if no saved preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    // Apply dark mode class to document (client-only)
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Save preference to localStorage
      try {
        localStorage.setItem('darkMode', isDarkMode.toString());
      } catch (error) {
        console.warn('Failed to save dark mode preference to localStorage:', error);
      }
    }
  }, [isDarkMode]);

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