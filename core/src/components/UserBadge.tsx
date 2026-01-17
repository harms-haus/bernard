"use client";

import { useRouter } from 'next/navigation';
import { User as UserIcon, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function UserBadge() {
  const router = useRouter();

  const handleLogout = () => {
    router.push('/auth/logout');
  };

  const handleProfile = () => {
    router.push('/bernard/user/profile');
  };

  const handleTokens = () => {
    router.push('/bernard/user/tokens');
  };

  const userName = typeof window !== 'undefined'
    ? localStorage.getItem('bernard_user_displayName') || 'User'
    : 'User';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="w-full text-left">
          <div className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
            <UserIcon className="mr-3 h-5 w-5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                {userName}
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <ChevronDown className="h-4 w-4 text-foreground rotate-180" />
            </div>
          </div>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="bg-card rounded-md shadow-lg border border-border py-1 z-50 min-w-[220px]"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item
            onSelect={handleProfile}
            className="px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none"
          >
            Profile
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={handleTokens}
            className="px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none"
          >
            Tokens
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 border-t border-border" />
          <DropdownMenu.Item
            onSelect={handleLogout}
            className="px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}