import * as React from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Copy, Plus, RefreshCw, Trash2, Key, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TokenWithSecret extends apiClient.Token {
  token?: string;
}

export function Keys() {
  const { state } = useAuth();
  const [tokens, setTokens] = React.useState<TokenWithSecret[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showSecretDialog, setShowSecretDialog] = React.useState(false);
  const [newTokenName, setNewTokenName] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [latestSecret, setLatestSecret] = React.useState<{ name: string; token: string } | null>(null);
  const [copiedTokenId, setCopiedTokenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadTokens();
  }, []);

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
      setTokens(prev => [newToken, ...prev]);
      setNewTokenName('');
      setShowCreateDialog(false);
      
      // Show the secret only once
      if (newToken.token) {
        setLatestSecret({ name: newToken.name, token: newToken.token });
        setShowSecretDialog(true);
      }
      
      toast.success('Token created successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
      toast.error('Failed to create token');
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

  const copyToClipboard = async (text: string, tokenId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTokenId(tokenId);
      setTimeout(() => setCopiedTokenId(null), 2000);
      toast.success('Token copied to clipboard');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>
                            {token.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div>{token.name}</div>
                          <div className="text-xs text-gray-500 font-mono">{token.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(token.createdAt)}</TableCell>
                    <TableCell>
                      {token.lastUsedAt ? formatDate(token.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={token.status === 'active' ? 'default' : 'secondary'}>
                        {token.status === 'active' ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleStatus(token)}
                      >
                        {token.status === 'active' ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(token.id, token.id)}
                        disabled={copiedTokenId === token.id}
                      >
                        {copiedTokenId === token.id ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy ID
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteToken(token)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <span>Your New Token</span>
            </DialogTitle>
            <DialogDescription>
              Copy this token now. It will not be shown again for security reasons.
            </DialogDescription>
          </DialogHeader>
          {latestSecret && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Token Name</div>
                <div className="font-mono text-sm">{latestSecret.name}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-gray-500">Token</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(latestSecret.token, 'secret')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <div className="font-mono text-sm break-all">{latestSecret.token}</div>
              </div>
              <div className="text-xs text-gray-500">
                Store this token securely. You will need it to authenticate API requests.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowSecretDialog(false)}>
              I've Saved It
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}