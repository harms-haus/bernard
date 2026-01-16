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
import { ConversationHistory } from '@/components/chat/ConversationHistory';
import { ThreadProvider } from '@/providers/ThreadProvider';

interface TokenWithSecret extends Token {
  token?: string;
}

export default function KeysPage() {
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
    loadTokens();
  }, []);

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
    <ThreadProvider>
      <div className="flex w-full h-screen overflow-hidden bg-background">
        <ConversationHistory />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-6 py-6 max-w-6xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">Access Tokens</h1>
                  <p className="text-gray-500">Manage your API tokens for accessing Bernard</p>
                </div>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Token
                </Button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                  {error}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Your Tokens</CardTitle>
                  <CardDescription>Manage access to your Bernard account</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-8 w-8 animate-spin text-gray-500" />
                    </div>
                  ) : tokens.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No tokens yet. Create your first token to get started.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Name</TableHead>
                            <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Created</TableHead>
                            <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Last Used</TableHead>
                            <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</TableHead>
                            <TableHead className="text-center py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tokens.map((token) => (
                            <TableRow key={token.id} className="border-b border-gray-100 dark:border-gray-800">
                              <TableCell className="font-medium py-3 px-4">
                                <div>
                                  <div>{token.name || 'Unnamed Token'}</div>
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex flex-col">
                                  <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {token.createdAt ? formatDate(token.createdAt).date : 'Invalid Date'}
                                  </span>
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    {token.createdAt ? formatDate(token.createdAt).time : ''}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                {token.lastUsedAt ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">
                                      {formatDate(token.lastUsedAt).date}
                                    </span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      {formatDate(token.lastUsedAt).time}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-600 dark:text-gray-300">Never</span>
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
                                      className="text-red-600 focus:text-red-600"
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
                              <TableCell colSpan={5} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
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
                      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Token Name</div>
                        <div className="font-mono text-sm dark:text-gray-300">{latestSecret.name}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-gray-500 dark:text-gray-400">API Key</div>
                          <div className="flex items-center space-x-2">
                            {latestSecret.token !== 'TOKEN_NOT_RETURNED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(latestSecret.token)}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            {latestSecret.token !== 'TOKEN_NOT_RETURNED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowActualToken(!showActualToken)}
                                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                              >
                                {showActualToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="font-mono text-sm break-all bg-gray-100 dark:bg-gray-700 rounded p-2">
                          {latestSecret.token === 'TOKEN_NOT_RETURNED' ? (
                            <span className="text-red-600 dark:text-red-400">Error: Token not returned from server</span>
                          ) : showActualToken ? latestSecret.token : latestSecret.token.replace(/./g, '*')}
                        </div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
                        <div className="text-xs font-medium text-yellow-800 dark:text-yellow-300">IMPORTANT WARNING</div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-200 mt-1">
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
        </div>
      </div>
    </ThreadProvider>
  );
}
