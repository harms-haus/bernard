import { Link, Outlet } from 'react-router-dom';
import { UserBadge } from './UserBadge';
import { DarkModeToggle } from './DarkModeToggle';

export function UserLayout() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="text-xl font-semibold text-gray-900 dark:text-white">
                Bernard UI
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                className="text-foreground hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium"
              >
                Home
              </Link>
              <Link
                to="/chat"
                className="text-foreground hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium"
              >
                Chat
              </Link>
              <Link
                to="/profile"
                className="text-foreground hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium"
              >
                Profile
              </Link>
              <Link
                to="/keys"
                className="text-foreground hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium"
              >
                Keys
              </Link>
              <Link
                to="/about"
                className="text-foreground hover:text-foreground/80 px-3 py-2 rounded-md text-sm font-medium"
              >
                About
              </Link>
              <DarkModeToggle />
              <UserBadge />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}