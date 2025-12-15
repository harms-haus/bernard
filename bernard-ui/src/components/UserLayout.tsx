import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { UserBadge } from './UserBadge';
import { DarkModeToggle } from './DarkModeToggle';
import {
  Home,
  MessagesSquare,
  Key,
  Info,
  Menu,
  X,
  Shield,
  User as UserIcon,
  ChevronDown
} from 'lucide-react';

const navigation = [
  { name: 'Chat', href: '/chat', icon: MessagesSquare },
  { name: 'Keys', href: '/keys', icon: Key },
  { name: 'About', href: '/about', icon: Info },
];

export function UserLayout() {
  const location = useLocation();
  const { state } = useAuth();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:inset-0`}>
          <div className="flex flex-col h-full bg-card border-r border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Link to="/" className="text-xl font-semibold text-foreground">
                Bernard UI
              </Link>
              <div className="flex items-center space-x-2">
                <DarkModeToggle />
                <button
                  className="lg:hidden inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary/80 dark:text-secondary-foreground dark:hover:bg-secondary/70 h-9 px-3"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close sidebar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <nav className="flex-1 overflow-y-auto py-4">
              <div className="space-y-1 px-2">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t border-border p-4 space-y-3">
              {/* Admin button for admins only */}
              {state.user?.isAdmin && (
                <Link
                  to="/admin"
                  className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Shield className="mr-3 h-5 w-5" />
                  Admin
                </Link>
              )}

              {/* User badge at bottom of nav panel */}
              <div className="relative">
                <button
                  className="w-full text-left"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                >
                  <div className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
                    <UserIcon className="mr-3 h-5 w-5" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        {state.user?.displayName || 'User'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {state.user?.id}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      {state.user?.isAdmin && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                          Admin
                        </span>
                      )}
                      <ChevronDown className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                </button>

                {userMenuOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-card rounded-md shadow-lg border border-border py-1 z-50">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">
                        {state.user?.displayName || 'User'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {state.user?.id}
                      </p>
                    </div>
                    <div className="py-1">
                      <Link
                        to="/profile"
                        className="block px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <Link
                        to="/login"
                        className="block px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Sign out
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar for mobile */}
          <header className="lg:hidden bg-card shadow-sm border-b border-border">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary/80 dark:text-secondary-foreground dark:hover:bg-secondary/70 h-9 px-3"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link to="/" className="text-xl font-semibold text-foreground">
                Bernard UI
              </Link>
              <div className="flex items-center space-x-2">
                <DarkModeToggle />
                <UserBadge />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6 bg-background">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}