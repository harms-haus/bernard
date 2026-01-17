'use client';

import { useState } from 'react';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useSidebarState } from './SidebarProvider';
import { useHeaderService } from './HeaderService';
import { useRouter } from 'next/navigation';
import { PanelRightOpen, PanelRightClose, PenSquare, MoreVertical, Ghost, Sun, Moon } from 'lucide-react';

export function BernardHeader() {
  const { title, subtitle } = useHeaderService();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [sidebarOpen, , toggleSidebar] = useSidebarState();
  const router = useRouter();
  const [isGhostMode, setIsGhostMode] = useState(false);

  const handleNewChat = () => {
    router.replace('/bernard/chat');
  };

  return (
    <header className="flex items-center justify-between gap-3 px-4 h-14 border-b bg-background/95 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open chat history">
            <PanelRightOpen className="size-5" />
          </Button>
        )}
        {sidebarOpen && (
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <PanelRightClose className="size-5" />
          </Button>
        )}
        <div className="flex flex-col">
          <span className="font-semibold tracking-tight leading-none">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground leading-none mt-0.5">{subtitle}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDarkMode ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleNewChat}>
              <PenSquare className="mr-2 h-4 w-4" />
              New Chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsGhostMode(!isGhostMode)}>
              <Ghost className="mr-2 h-4 w-4" />
              {isGhostMode ? 'Disable' : 'Enable'} Ghost Mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
