"use client";

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { User as UserIcon, ChevronDown } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

export function UserBadge() {
  const { state, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/bernard/login');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  const handleProfile = () => {
    router.push('/bernard/profile');
  };

  const handleKeys = () => {
    router.push('/bernard/keys');
  };

  if (!state.user) {
    return null;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="w-full text-left">
          <div className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
            <UserIcon className="mr-3 h-5 w-5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                {state.user.displayName || 'User'}
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
            onSelect={handleKeys}
            className="px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none"
          >
            Keys
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