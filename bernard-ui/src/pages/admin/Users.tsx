import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { 
  Plus, 
  Save, 
  Trash2, 
  UserPlus,
  UserCheck,
  UserX,
  Edit,
  Shield,
  Mail,
  Calendar
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { User, UserStatus } from '../../types/auth';

interface UserForm {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

export default function Users() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>({
    id: '',
    displayName: '',
    isAdmin: false
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const userList = await adminApiClient.listUsers();
      setUsers(userList);
    } catch (error) {
      console.error('Failed to load users:', error);
      alert('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = userForm.displayName.trim();
    if (!trimmedName) {
      alert('Display name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const updatedUser = await adminApiClient.updateUser(editingUser.id, {
          displayName: trimmedName,
          isAdmin: userForm.isAdmin
        });
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        alert('User updated successfully!');
      } else {
        const newUser = await adminApiClient.createUser({
          id: userForm.id.trim(),
          displayName: trimmedName,
          isAdmin: userForm.isAdmin
        });
        setUsers([...users, newUser]);
        alert('User created successfully!');
      }
      
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ id: '', displayName: '', isAdmin: false });
    } catch (error: any) {
      console.error('Failed to save user:', error);
      const errorMessage = error?.details || error?.message || 'Failed to save user';
      alert(`Error: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setUserForm({
      id: user.id,
      displayName: user.displayName,
      isAdmin: user.isAdmin
    });
    setShowUserForm(true);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Delete this user? This action cannot be undone.')) {
      return;
    }

    setDeletingId(userId);
    try {
      const updatedUser = await adminApiClient.deleteUser(userId);
      setUsers(users.map(u => u.id === userId ? updatedUser : u));
      alert('User deleted successfully!');
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      const updatedUser = await adminApiClient.updateUser(user.id, { status: newStatus });
      setUsers(users.map(u => u.id === user.id ? updatedUser : u));
      alert(`User ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      console.error('Failed to update user status:', error);
      alert('Failed to update user status');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Reset password for this user?')) {
      return;
    }

    try {
      await adminApiClient.resetUser(userId);
      alert('Password reset successfully!');
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert('Failed to reset password');
    }
  };

  const getStatusBadgeVariant = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'disabled':
        return 'warning';
      case 'deleted':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Users Management</h1>
          <p className="text-gray-600 dark:text-gray-300">Create, manage, and control user access</p>
        </div>
        <Button onClick={() => {
          setEditingUser(null);
          setUserForm({ id: '', displayName: '', isAdmin: false });
          setShowUserForm(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold">{users.length}</p>
              </div>
              <UserPlus className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {users.filter(u => u.status === 'active').length}
                </p>
              </div>
              <UserCheck className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Admins</p>
                <p className="text-2xl font-bold text-purple-600">
                  {users.filter(u => u.isAdmin).length}
                </p>
              </div>
              <Shield className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">User</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Email/ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Role</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Created</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Last Login</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.displayName}</p>
                          {user.isAdmin && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                              <Shield className="mr-1 h-3 w-3" />
                              Admin
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-300 font-mono">
                          {user.id}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={user.isAdmin ? "secondary" : "outline"}>
                        {user.isAdmin ? 'Administrator' : 'User'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                        {user.status === 'active' ? 'Active' : 
                         user.status === 'disabled' ? 'Disabled' : 'Deleted'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                        
                        <Button
                          variant={user.status === 'active' ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => handleToggleStatus(user)}
                        >
                          {user.status === 'active' ? (
                            <>
                              <UserX className="mr-2 h-4 w-4" />
                              Disable
                            </>
                          ) : (
                            <>
                              <UserCheck className="mr-2 h-4 w-4" />
                              Enable
                            </>
                          )}
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResetPassword(user.id)}
                        >
                          Reset Password
                        </Button>
                        
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deletingId === user.id}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {deletingId === user.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit User Form */}
      {showUserForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingUser ? 'Edit User' : 'Add User'}</CardTitle>
            <CardDescription>
              {editingUser ? 'Update user information and permissions' : 'Create a new user account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUserSubmit} className="space-y-4">
              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="id">User ID (Email)</Label>
                  <Input
                    id="id"
                    value={userForm.id}
                    onChange={(e) => setUserForm({ ...userForm, id: e.target.value })}
                    placeholder="user@example.com"
                    disabled={!!editingUser}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This will be used as the user's login identifier
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={userForm.displayName}
                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={userForm.isAdmin}
                  onChange={(e) => setUserForm({ ...userForm, isAdmin: e.target.checked })}
                  className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <Label htmlFor="isAdmin" className="flex items-center space-x-2">
                  <Shield className="h-4 w-4" />
                  <span>Grant Administrator Privileges</span>
                </Label>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => {
                  setShowUserForm(false);
                  setEditingUser(null);
                  setUserForm({ id: '', displayName: '', isAdmin: false });
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}