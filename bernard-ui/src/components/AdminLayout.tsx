import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { adminApiClient } from '../services/adminApi';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  LayoutDashboard,
  Settings,
  MessagesSquare,
  Users as UsersIcon,
  LogOut,
  X,
  Home,
  User as UserIcon,
  ChevronDown
} from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Models', href: '/admin/models', icon: Settings },
  { name: 'History', href: '/admin/history', icon: MessagesSquare },
  { name: 'Users', href: '/admin/users', icon: UsersIcon },
];

export function AdminLayout() {
  const location = useLocation();
  const { isAdmin, isAdminLoading, user } = useAdminAuth();
  const { isDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await adminApiClient.logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Checking admin privileges...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You don't have admin privileges to access this area.
            </p>
            <div className="flex gap-2">
              <Button>
                <Link to="/" className="flex items-center">
                  <Home className="mr-2 h-4 w-4" />
                  Back to Home
                </Link>
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/profile'}>
                Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:inset-0`}>
          <div className="flex flex-col h-full bg-card border-r border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h1 className="text-xl font-semibold text-foreground">Admin Panel</h1>
              <div className="flex items-center space-x-2">
                {/* Dark mode toggle moved to the right side of the nav panel */}
                <DarkModeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  onClick={() => setSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
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
              {/* Main chat link moved to just above the user badge */}
              <Button variant="outline" className="w-full justify-start" onClick={() => {
                window.location.href = '/';
                setSidebarOpen(false);
              }}>
                <Home className="mr-2 h-4 w-4" />
                Main Chat
              </Button>

              {/* User badge moved to bottom of nav panel */}
              <div className="relative">
                <Button
                  variant="ghost"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="w-full justify-start"
                >
                  <UserIcon className="mr-2 h-5 w-5" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-foreground">
                      {user?.displayName || user?.id || 'Admin'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user?.id}
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Badge variant="secondary">Admin</Badge>
                    <ChevronDown className="h-4 w-4 text-foreground" />
                  </div>
                </Button>

                {userMenuOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-card rounded-md shadow-lg border border-border py-1 z-50">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">
                        {user?.displayName || user?.id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user?.id}
                      </p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          window.location.href = '/profile';
                          setUserMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        Profile
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <LogOut className="inline mr-2 h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6 bg-background">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}