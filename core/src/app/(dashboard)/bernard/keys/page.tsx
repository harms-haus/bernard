"use client";

import * as React from 'react';
import { apiClient, Token } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Copy, Plus, RefreshCw, Trash2, Key, MoreVertical, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useHeaderService } from '@/components/chat/HeaderService';

interface TokenWithSecret extends Token {
  token?: string;
}

export default function KeysPage() {
  const { setTitle, setSubtitle } = useHeaderService();
  const [tokens, setTokens] = React.useState<TokenWithSecret[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showSecretDialog, setShowSecretDialog] = React.useState(false);
  const [newTokenName, setNewTokenName] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [latestSecret, setLatestSecret] = React.useState<{ name: string; token: string } | null>(null);
  const [showActualToken, setShowActualToken] = React.useState(false);

  React.useEffect(() => {
    setTitle('Access Tokens');
    setSubtitle('Manage your API tokens for accessing Bernard');
    loadTokens();
  }, [setTitle, setSubtitle]);

  React.useEffect(() => {
    if (showSecretDialog && latestSecret) {
      console.log('Secret dialog opened for token:', latestSecret.name);
    }
  }, [showSecretDialog, latestSecret]);

  const loadTokens = async () => {
    try {
      setLoading(true);
      setError(null);
      const tokenList = await apiClient.listTokens();
      setTokens(tokenList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tokens');
      toast.error('Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const newToken = await apiClient.createToken({ name: newTokenName.trim() });

      // Add token to list without the secret (for security)
      const { token: _, ...tokenWithoutSecret } = newToken;
      setTokens(prev => [tokenWithoutSecret, ...prev]);
      setNewTokenName('');
      setShowCreateDialog(false);

      // Show the secret only once in the dialog
      if (newToken.token) {
        setLatestSecret({ name: newToken.name, token: newToken.token });
        setShowSecretDialog(true);
        console.log('Token created, opening secret dialog:', newToken.name);
        toast.success('Token created successfully');
      } else {
        console.warn('Token created but no token secret returned:', newToken);
        toast.warning('Token created but no API key was returned');
        // Still show the dialog with available info
        setLatestSecret({ name: newToken.name, token: 'TOKEN_NOT_RETURNED' });
        setShowSecretDialog(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
      toast.error('Failed to create token');
      console.error('Token creation error:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (token: TokenWithSecret) => {
    try {
      const updated = await apiClient.updateToken(token.id, {
        status: token.status === 'active' ? 'disabled' : 'active'
      });
      setTokens(prev => prev.map(t => t.id === updated.id ? updated : t));
      toast.success(`Token ${updated.status === 'active' ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token');
      toast.error('Failed to update token');
    }
  };

  const handleDeleteToken = async (token: TokenWithSecret) => {
    try {
      await apiClient.deleteToken(token.id);
      setTokens(prev => prev.filter(t => t.id !== token.id));
      toast.success('Token deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token');
      toast.error('Failed to delete token');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Token copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    };
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto px-6 py-6 max-w-6xl">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Tokens</CardTitle>
                <CardDescription>Manage access to your Bernard account</CardDescription>
              </div>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Token
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No tokens yet. Create your first token to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Name</TableHead>
                      <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Created</TableHead>
                      <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Last Used</TableHead>
                      <TableHead className="text-left py-3 px-4 font-semibold text-muted-foreground">Status</TableHead>
                      <TableHead className="text-center py-3 px-4 font-semibold text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((token) => (
                      <TableRow key={token.id} className="border-b border-border">
                        <TableCell className="font-medium py-3 px-4">
                          <div>
                            <div>{token.name || 'Unnamed Token'}</div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          {token.lastUsedAt ? (
                            <div className="flex flex-col">
                              <span className="text-sm text-muted-foreground">
                                {formatDate(token.lastUsedAt).date}
                              </span>
                              <span className="text-xs text-muted-foreground/70">
                                {formatDate(token.lastUsedAt).time}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <Badge variant={token.status === 'active' ? 'default' : 'secondary'}>
                            {token.status === 'active' ? 'Active' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" aria-label="Token actions">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleStatus(token)}>
                                {token.status === 'active' ? 'Disable' : 'Enable'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyToClipboard(token.id)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy ID
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteToken(token)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}

                    {tokens.length === 0 && (
                      <TableRow key="no-tokens">
                        <TableCell colSpan={5} className="py-8 px-4 text-center text-muted-foreground">
                          No tokens found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Token Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Token</DialogTitle>
              <DialogDescription>
                Generate a new access token for your Bernard account. The token will be shown only once.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateToken}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                    placeholder="e.g., Mobile App, Home Assistant"
                    required
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !newTokenName.trim()}>
                    {creating ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Token
                      </>
                    )}
                  </Button>
                  <Button variant="outline" type="button" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Secret Display Dialog */}
        <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-3">
                <Key className="h-5 w-5" />
                <span>Your New API Key</span>
              </DialogTitle>
              <DialogDescription>
                This is your new API key. It will NOT be shown again after you close this dialog.
              </DialogDescription>
            </DialogHeader>
            {latestSecret && (
              <div className="space-y-4">
                <div className="bg-muted border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">Token Name</div>
                  <div className="font-mono text-sm text-foreground">{latestSecret.name}</div>
                </div>
                <div className="bg-muted border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-muted-foreground">API Key</div>
                    <div className="flex items-center space-x-2">
                      {latestSecret.token !== 'TOKEN_NOT_RETURNED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(latestSecret.token)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                      {latestSecret.token !== 'TOKEN_NOT_RETURNED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowActualToken(!showActualToken)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {showActualToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                    <div className="font-mono text-sm break-all bg-muted/50 rounded p-2">
                      {latestSecret.token === 'TOKEN_NOT_RETURNED' ? (
                        <span className="text-destructive">Error: Token not returned from server</span>
                      ) : showActualToken ? latestSecret.token : latestSecret.token.split('').map(() => '*').join('')}
                    </div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="text-xs font-medium text-yellow-500">IMPORTANT WARNING</div>
                  <div className="text-sm text-yellow-500/80 mt-1">
                    {latestSecret.token === 'TOKEN_NOT_RETURNED' ? (
                      'There was an issue retrieving your API key. Please try creating the token again.'
                    ) : (
                      'This API key will NOT be shown again after you close this dialog. Make sure to copy it now and store it securely.'
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowSecretDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
