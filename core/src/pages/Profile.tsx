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
  const successTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track if there are unsaved changes (normalize by trimming)
  const normalizedDisplayName = displayName.trim();
  const normalizedEmail = email.trim();
  const normalizedUserDisplayName = state.user?.displayName?.trim() || '';
  const normalizedUserEmail = state.user?.email?.trim() || '';
  
  const hasChanges = state.user && (
    normalizedDisplayName !== normalizedUserDisplayName ||
    normalizedEmail !== normalizedUserEmail
  );

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

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

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
      
      // Clear any existing timeout
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      
      // Set new timeout
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!state.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your account information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={state.user.image || undefined} />
                  <AvatarFallback>
                    {state.user.displayName?.charAt(0).toUpperCase() || state.user.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{state.user.displayName || 'User'}</h3>
                  <p className="text-sm text-muted-foreground">{state.user.email}</p>
                  <Badge variant="secondary" className="mt-2">
                    {state.user.role}
                  </Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">
                    <User className="inline h-4 w-4 mr-2" />
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    <Mail className="inline h-4 w-4 mr-2" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              {state.error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                  {state.error}
                </div>
              )}

              {successMessage && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-500 text-sm rounded-lg">
                  {successMessage}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={!hasChanges || isSaving}
                  className="min-w-[100px]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function Profile() {
  return <ProfileContent />;
}
