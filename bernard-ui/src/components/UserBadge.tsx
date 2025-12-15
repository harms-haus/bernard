import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { User as UserIcon, ChevronDown } from 'lucide-react';

export function UserBadge() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      // Error is handled in the hook
    }
  };

  const handleProfile = () => {
    navigate('/profile');
    setUserMenuOpen(false);
  };

  const handleKeys = () => {
    navigate('/keys');
    setUserMenuOpen(false);
  };

  if (!state.user) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="w-full text-left"
        onClick={() => setUserMenuOpen(!userMenuOpen)}
      >
        <div className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
          <UserIcon className="mr-3 h-5 w-5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              {state.user.displayName || 'User'}
            </div>
            <div className="text-xs text-muted-foreground">
              {state.user.id}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {state.user.isAdmin && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                Admin
              </span>
            )}
            <ChevronDown className="h-4 w-4 text-foreground" />
          </div>
        </div>
      </button>

      {userMenuOpen && (
        <div className="absolute left-0 right-0 bottom-full mb-2 bg-card rounded-md shadow-lg border border-border py-1 z-50">
          <div className="py-1">
            <button
              onClick={handleProfile}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Profile
            </button>
            <button
              onClick={handleKeys}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Keys
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}