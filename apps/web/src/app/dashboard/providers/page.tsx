'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { providers } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Key, RefreshCw, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PROVIDER_TYPES = ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'LOCAL'];

export default function ProvidersPage() {
  const queryClient = useQueryClient();
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    type: 'OPENAI',
    baseUrl: '',
  });
  const [addingKeyFor, setAddingKeyFor] = useState<string | null>(null);
  const [newKey, setNewKey] = useState({ keyAlias: '', apiKey: '' });

  const { data: providerList, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providers.list().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => providers.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setShowAddProvider(false);
      setNewProvider({ name: '', type: 'OPENAI', baseUrl: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => providers.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });

  const addKeyMutation = useMutation({
    mutationFn: ({ providerId, data }: { providerId: string; data: any }) =>
      providers.addKey(providerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] });
      setAddingKeyFor(null);
      setNewKey({ keyAlias: '', apiKey: '' });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: string) => providers.deleteKey(keyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['providers'] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => providers.test(id),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Providers</h1>
          <p className="text-muted-foreground">
            Manage your AI provider connections
          </p>
        </div>
        <Button onClick={() => setShowAddProvider(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {/* Add Provider Form */}
      {showAddProvider && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Input
                placeholder="Provider name"
                value={newProvider.name}
                onChange={(e) =>
                  setNewProvider({ ...newProvider, name: e.target.value })
                }
              />
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={newProvider.type}
                onChange={(e) =>
                  setNewProvider({ ...newProvider, type: e.target.value })
                }
              >
                {PROVIDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Base URL (optional)"
                value={newProvider.baseUrl}
                onChange={(e) =>
                  setNewProvider({ ...newProvider, baseUrl: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => createMutation.mutate(newProvider)}
                disabled={!newProvider.name || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Provider'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAddProvider(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Provider List */}
      <div className="space-y-4">
        {providerList?.map((provider: any) => (
          <Card key={provider.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {provider.name}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      provider.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                    )}
                  >
                    {provider.status}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {provider.type} • {provider._count?.requestLogs || 0} requests
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate(provider.id)}
                  disabled={testMutation.isPending}
                >
                  <RefreshCw
                    className={cn(
                      'mr-2 h-4 w-4',
                      testMutation.isPending && 'animate-spin',
                    )}
                  />
                  Test
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingKeyFor(provider.id)}
                >
                  <Key className="mr-2 h-4 w-4" />
                  Add Key
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteMutation.mutate(provider.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Key Form */}
              {addingKeyFor === provider.id && (
                <div className="mb-4 flex gap-2">
                  <Input
                    placeholder="Key alias"
                    value={newKey.keyAlias}
                    onChange={(e) =>
                      setNewKey({ ...newKey, keyAlias: e.target.value })
                    }
                  />
                  <Input
                    type="password"
                    placeholder="API Key"
                    value={newKey.apiKey}
                    onChange={(e) =>
                      setNewKey({ ...newKey, apiKey: e.target.value })
                    }
                  />
                  <Button
                    size="icon"
                    onClick={() =>
                      addKeyMutation.mutate({
                        providerId: provider.id,
                        data: newKey,
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setAddingKeyFor(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Keys List */}
              {provider.keys?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">API Keys</p>
                  {provider.keys.map((key: any) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{key.keyAlias}</p>
                        <p className="text-xs text-muted-foreground">
                          {key.keyPrefix}*** • Used {key.usageCount} times
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs',
                            key.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                          )}
                        >
                          {key.status}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteKeyMutation.mutate(key.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {provider.keys?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No API keys configured. Add a key to start using this provider.
                </p>
              )}
            </CardContent>
          </Card>
        ))}

        {providerList?.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No providers configured</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowAddProvider(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add your first provider
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
