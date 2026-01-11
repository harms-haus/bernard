import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch as SwitchComponent } from '../../components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import {
  Plus,
  Save,
  Trash2,
  UserCheck,
  UserX,
  Edit,
  Shield,
  Mail,
  MoreVertical,
  Key,
  Users as UsersIcon
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { User, UserStatus } from '../../types/auth';
import { useToast } from '../../components/ToastManager';
import { useConfirmDialog } from '../../components/DialogManager';

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
  const [allowUserCreation, setAllowUserCreation] = useState(true);
  
  // Hook calls - must be at the top level of the component function
  const toast = useToast();
  const confirmDialog = useConfirmDialog();

  useEffect(() => {
    loadUsers();
    loadLimitsSettings();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const userList = await adminApiClient.listUsers();
      setUsers(userList);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const loadLimitsSettings = async () => {
    try {
      const limits = await adminApiClient.getLimitsSettings();
      setAllowUserCreation(limits.allowUserCreation);
    } catch (error) {
      console.error('Failed to load limits settings:', error);
    }
  };

  const handleUserCreationToggle = async (enabled: boolean) => {
    setAllowUserCreation(enabled);
    try {
      const limits = await adminApiClient.getLimitsSettings();
      await adminApiClient.updateLimitsSettings({
        ...limits,
        allowUserCreation: enabled
      });
      toast.success(`User creation ${enabled ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      console.error('Failed to update limits settings:', error);
      setAllowUserCreation(!enabled);
      toast.error('Failed to update user creation setting');
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = userForm.displayName.trim();
    if (!trimmedName) {
      toast.warning('Display name is required');
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
        toast.success('User updated successfully!');
      } else {
        const newUser = await adminApiClient.createUser({
          id: userForm.id.trim(),
          displayName: trimmedName,
          isAdmin: userForm.isAdmin
        });
        setUsers([...users, newUser]);
        toast.success('User created successfully!');
      }
      
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ id: '', displayName: '', isAdmin: false });
    } catch (error: any) {
      console.error('Failed to save user:', error);
      const errorMessage = error?.details || error?.message || 'Failed to save user';
      toast.error(`Error: ${errorMessage}`);
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
    confirmDialog({
      title: 'Delete User',
      description: 'Delete this user? This action cannot be undone.',
      confirmVariant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDeletingId(userId);
        try {
          const updatedUser = await adminApiClient.deleteUser(userId);
          setUsers(users.map(u => u.id === userId ? updatedUser : u));
          toast.success('User deleted successfully!');
        } catch (error) {
          console.error('Failed to delete user:', error);
          toast.error('Failed to delete user');
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      const updatedUser = await adminApiClient.updateUser(user.id, { status: newStatus });
      setUsers(users.map(u => u.id === user.id ? updatedUser : u));
      toast.success(`User ${newStatus === 'active' ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      console.error('Failed to update user status:', error);
      toast.error('Failed to update user status');
    }
  };

  const handleResetPassword = async (userId: string) => {
    confirmDialog({
      title: 'Reset Password',
      description: 'Reset password for this user?',
      confirmText: 'Reset',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await adminApiClient.resetUser(userId);
          toast.success('Password reset successfully!');
        } catch (error) {
          console.error('Failed to reset password:', error);
          toast.error('Failed to reset password');
        }
      }
    });
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

      {/* User Creation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <UsersIcon className="h-5 w-5" />
            <span>User Creation Settings</span>
          </CardTitle>
          <CardDescription>Control whether new users can be created through the admin panel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="allowUserCreation" className="text-base">Allow User Creation</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                When enabled, administrators can create new users through the "Add User" button.
                Existing users can still log in via OAuth regardless of this setting.
              </p>
            </div>
            <SwitchComponent
              id="allowUserCreation"
              checked={allowUserCreation}
              onCheckedChange={handleUserCreationToggle}
            />
          </div>
        </CardContent>
      </Card>


      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Manage user accounts and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">User</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Email/ID</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Role</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Created</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Last Login</TableHead>
                  <TableHead className="text-center py-3 px-4 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-b border-gray-100 dark:border-gray-800">
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.displayName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-300 font-mono">
                          {user.id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant={user.isAdmin ? "secondary" : "outline"}>
                        {user.isAdmin ? 'Administrator' : 'User'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                        {user.status === 'active' ? 'Active' :
                         user.status === 'disabled' ? 'Disabled' : 'Deleted'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(user.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      {user.lastLoginAt ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {new Date(user.lastLoginAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(user.lastLoginAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-600 dark:text-gray-300">Never</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="User actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                            <Key className="mr-2 h-4 w-4" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
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
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={deletingId === user.id}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingId === user.id ? 'Deleting...' : 'Delete'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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