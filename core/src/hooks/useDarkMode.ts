"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type DarkModeContextType = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
};

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

// Export DarkModeContext for testing purposes
export { DarkModeContext };

// ============================================================================
// Test Dark Mode Context (for testing only)
// ============================================================================

export type TestDarkModeContextType = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
};

const TestDarkModeContext = createContext<TestDarkModeContextType | undefined>(undefined);

// Export TestDarkModeContext for test providers
export { TestDarkModeContext };

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

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(value);
  };

  const value = {
    isDarkMode,
    toggleDarkMode,
    setDarkMode,
  };

  return React.createElement(DarkModeContext.Provider, { value }, children);
}

export function useDarkMode() {
  // Always call both context hooks at the top level (rules of hooks)
  const testContext = useContext(TestDarkModeContext);
  const context = useContext(DarkModeContext);

  // Check for test context first (used in test environment)
  if (testContext !== undefined) {
    return testContext;
  }

  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
}
