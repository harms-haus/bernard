"use client";
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useDarkMode } from '@/hooks/useDarkMode';
import { MoreVertical, Sun, Moon } from 'lucide-react';

import { useDynamicHeader, DynamicHeaderAction } from '../dynamic-header';

export function BernardHeader() {
  const { title, subtitle, actions } = useDynamicHeader();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <header className="flex items-center justify-between gap-3 px-4 h-14 border-b bg-background/95 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="font-semibold tracking-tight leading-none">
            {subtitle || title}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4" />}
        </Button>

        {actions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action: DynamicHeaderAction) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={action.className}
                >
                  {action.icon}
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
