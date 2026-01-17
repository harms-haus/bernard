"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Save, User, Mail, Lock } from 'lucide-react';
import { useDynamicHeader } from '@/components/dynamic-header';

function ProfileContent() {
  const { state, updateProfile, clearError } = useAuth();
  const { setTitle, setSubtitle } = useDynamicHeader();
  const [displayName, setDisplayName] = React.useState(state.user?.displayName || '');
  const [email, setEmail] = React.useState(state.user?.email || '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTitle('User Settings');
    setSubtitle('Profile');
  }, [setTitle, setSubtitle]);

  React.useEffect(() => {
    if (state.user) {
      setDisplayName(state.user.displayName);
      setEmail(state.user.email);
    }
  }, [state.user]);

  React.useEffect(() => {
    if (state.error) {
      setSuccessMessage(null);
    }
  }, [state.error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsSaving(true);
    setSuccessMessage(null);
    clearError();

    try {
      await updateProfile({
        displayName: displayName.trim(),
        email: email.trim(),
      });
      setSuccessMessage('Profile updated successfully!');
    } catch (error) {
      // Error is handled by the auth hook
    } finally {
      setIsSaving(false);
    }
  };

  if (!state.user) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-6 max-w-2xl">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-6 py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src="" alt={state.user.displayName} />
                <AvatarFallback>
                  {state.user.displayName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold text-lg flex items-center gap-2">
                  {state.user.displayName}
                  {state.user.isAdmin && (
                    <Badge variant="secondary" className="text-xs">Admin</Badge>
                  )}
                </div>
                <CardDescription>{state.user.id}</CardDescription>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {state.error && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
                  {state.error}
                </div>
              )}

              {successMessage && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded">
                  {successMessage}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName" className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>Display Name</span>
                </Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="max-w-md"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userId" className="flex items-center space-x-2">
                  <Lock className="h-4 w-4" />
                  <span>User ID</span>
                </Label>
                <Input
                  id="userId"
                  value={state.user.id}
                  disabled
                  className="max-w-md bg-muted"
                />
                <p className="text-sm text-muted-foreground">User ID cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Email</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center space-x-2">
                  <Lock className="h-4 w-4" />
                  <span>Account Status</span>
                </Label>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${state.user.status === 'active'
                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                    }`}>
                    {state.user.status === 'active' ? 'Active' : 'Disabled'}
                  </span>
                  <span>•</span>
                  <span>Member since {new Date(state.user.createdAt).toLocaleDateString()}</span>
                  {state.user.lastLoginAt && (
                    <>
                      <span>•</span>
                      <span>Last login {new Date(state.user.lastLoginAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Button type="submit" disabled={isSaving || !displayName.trim()}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisplayName(state.user?.displayName || '');
                    setEmail(state.user?.email || '');
                    clearError();
                    setSuccessMessage(null);
                  }}
                  disabled={isSaving}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Profile() {
  return <ProfileContent />;
}
