import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  LayoutDashboard,
  Settings,
  MessagesSquare,
  Users as UsersIcon,
  Server,
  X,
  Home,
  Zap
} from 'lucide-react';
import { DarkModeToggle } from './DarkModeToggle';
import { UserBadge } from './UserBadge';

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { name: 'Models', href: '/admin/models', icon: Settings },
  { name: 'Services', href: '/admin/services', icon: Server },
  { name: 'Automations', href: '/admin/automations', icon: Zap },
  { name: 'History', href: '/admin/history', icon: MessagesSquare },
  { name: 'Users', href: '/admin/users', icon: UsersIcon },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isAdminLoading } = useAdminAuth();
  const { isDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
                navigate('/chat');
                setSidebarOpen(false);
              }}>
                <Home className="mr-2 h-4 w-4" />
                Main Chat
              </Button>

              {/* User badge */}
              <UserBadge />
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