import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch as SwitchComponent } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { adminApiClient } from '@/services/adminApi';
import type { User, UserStatus, UserRole } from '@/types/auth';
import { useToast } from '@/components/ToastManager';
import { useConfirmDialog } from '@/components/DialogManager';
interface UserForm {
  id: string;
  displayName: string;
  role: UserRole;
}
import { PageHeaderConfig } from '@/components/dynamic-header/configs';

function UsersContent() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>({
    id: '',
    displayName: '',
    role: 'user'
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [allowSignups, setAllowSignups] = useState(true);

  // Hook calls - must be at the top level of the component function
  const toast = useToast();
  const confirmDialog = useConfirmDialog();

  const loadUsers = useCallback(async () => {
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
  }, []);

  const loadLimitsSettings = useCallback(async () => {
    try {
      const limits = await adminApiClient.getLimitsSettings();
      setAllowSignups(limits.allowSignups);
    } catch (error) {
      console.error('Failed to load limits settings:', error);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadLimitsSettings();
  }, [loadUsers, loadLimitsSettings]);

  const handleUserCreationToggle = async (enabled: boolean) => {
    setAllowSignups(enabled);
    try {
      const limits = await adminApiClient.getLimitsSettings();
      await adminApiClient.updateLimitsSettings({
        ...limits,
        allowSignups: enabled
      });
      toast.success(`Signups ${enabled ? 'enabled' : 'disabled'} successfully!`);
    } catch (error) {
      console.error('Failed to update limits settings:', error);
      setAllowSignups(!enabled);
      toast.error('Failed to update signup setting');
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
          role: userForm.role
        });
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        toast.success('User updated successfully!');
      } else {
        const newUser = await adminApiClient.createUser({
          id: userForm.id.trim(),
          displayName: trimmedName,
          role: userForm.role
        });
        setUsers([...users, newUser]);
        toast.success('User created successfully!');
      }

      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ id: '', displayName: '', role: 'user' });
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
      role: user.role
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
          await adminApiClient.deleteUser(userId);
          setUsers(users.filter(u => u.id !== userId));
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeaderConfig
        title="Admin Panel"
        subtitle="Users Management"
      />
      <div className="flex items-center justify-end">
        <Button onClick={() => {
          setEditingUser(null);
          setUserForm({ id: '', displayName: '', role: 'user' });
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
              <p className="text-sm text-muted-foreground">
                When enabled, administrators can create new users through the &quot;Add User&quot; button.
                Existing users can still log in via OAuth regardless of this setting.
              </p>
            </div>
            <SwitchComponent
              id="allowSignups"
              checked={allowSignups}
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
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">User</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Email/ID</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Role</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Status</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Created</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Last Login</TableHead>
                  <TableHead className="text-center py-3 px-4 font-semibold text-muted-foreground"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-b border-border">
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.displayName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground font-mono">
                          {user.id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                        {user.role === "admin" ? "Administrator" :
                         user.role === "guest" ? "Guest" : "User"}
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
                        <span className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          {new Date(user.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      {user.lastLoginAt ? (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">
                            {new Date(user.lastLoginAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            {new Date(user.lastLoginAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
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
                            className="text-destructive focus:text-destructive"
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
                    <TableCell colSpan={7} className="py-8 px-4 text-center text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
                    This will be used as the user&apos;s login identifier
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

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="guest">Guest</option>
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Guests have limited access to tools and features
                </p>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => {
                  setShowUserForm(false);
                  setEditingUser(null);
                  setUserForm({ id: '', displayName: '', role: 'user' });
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

export function Users() {
  return <UsersContent />;
}
