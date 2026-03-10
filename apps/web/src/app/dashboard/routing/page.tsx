'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routing, providers } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical, Power } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RoutingPage() {
  const queryClient = useQueryClient();
  const [showAddRule, setShowAddRule] = useState(false);
  const [showAddAlias, setShowAddAlias] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    providerId: '',
    modelPattern: '*',
    targetModel: '',
    priority: 10,
  });
  const [newAlias, setNewAlias] = useState({
    alias: '',
    providerId: '',
    targetModel: '',
    description: '',
  });

  const { data: rules } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: () => routing.rules.list().then((res) => res.data),
  });

  const { data: aliases } = useQuery({
    queryKey: ['model-aliases'],
    queryFn: () => routing.aliases.list().then((res) => res.data),
  });

  const { data: providerList } = useQuery({
    queryKey: ['providers'],
    queryFn: () => providers.list().then((res) => res.data),
  });

  const createRuleMutation = useMutation({
    mutationFn: (data: any) => routing.rules.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setShowAddRule(false);
      setNewRule({ name: '', providerId: '', modelPattern: '*', targetModel: '', priority: 10 });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => routing.rules.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (id: string) => routing.rules.toggle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const createAliasMutation = useMutation({
    mutationFn: (data: any) => routing.aliases.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-aliases'] });
      setShowAddAlias(false);
      setNewAlias({ alias: '', providerId: '', targetModel: '', description: '' });
    },
  });

  const deleteAliasMutation = useMutation({
    mutationFn: (id: string) => routing.aliases.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-aliases'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Routing</h1>
        <p className="text-muted-foreground">
          Configure request routing rules and model aliases
        </p>
      </div>

      {/* Routing Rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Routing Rules</CardTitle>
          <Button size="sm" onClick={() => setShowAddRule(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Rule
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddRule && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Input
                  placeholder="Rule name"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                />
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={newRule.providerId}
                  onChange={(e) => setNewRule({ ...newRule, providerId: e.target.value })}
                >
                  <option value="">Select Provider</option>
                  {providerList?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input
                  placeholder="Model pattern"
                  value={newRule.modelPattern}
                  onChange={(e) => setNewRule({ ...newRule, modelPattern: e.target.value })}
                />
                <Input
                  placeholder="Target model"
                  value={newRule.targetModel}
                  onChange={(e) => setNewRule({ ...newRule, targetModel: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Priority"
                  value={newRule.priority}
                  onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createRuleMutation.mutate(newRule)}
                  disabled={!newRule.name || !newRule.providerId}
                >
                  Create Rule
                </Button>
                <Button variant="outline" onClick={() => setShowAddRule(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {rules?.map((rule: any) => (
              <div
                key={rule.id}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-4',
                  !rule.isActive && 'opacity-50',
                )}
              >
                <div className="flex items-center gap-4">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {rule.modelPattern} → {rule.provider?.name} ({rule.targetModel || 'same model'})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Priority: {rule.priority}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleRuleMutation.mutate(rule.id)}
                  >
                    <Power className={cn('h-4 w-4', rule.isActive && 'text-green-500')} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {(!rules || rules.length === 0) && !showAddRule && (
              <p className="text-center text-sm text-muted-foreground py-8">
                No routing rules configured. Requests will use the default provider.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Aliases */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Model Aliases</CardTitle>
          <Button size="sm" onClick={() => setShowAddAlias(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Alias
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddAlias && (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Input
                  placeholder="Alias (e.g., smart, cheap)"
                  value={newAlias.alias}
                  onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
                />
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={newAlias.providerId}
                  onChange={(e) => setNewAlias({ ...newAlias, providerId: e.target.value })}
                >
                  <option value="">Select Provider</option>
                  {providerList?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Input
                  placeholder="Target model"
                  value={newAlias.targetModel}
                  onChange={(e) => setNewAlias({ ...newAlias, targetModel: e.target.value })}
                />
                <Input
                  placeholder="Description"
                  value={newAlias.description}
                  onChange={(e) => setNewAlias({ ...newAlias, description: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createAliasMutation.mutate(newAlias)}
                  disabled={!newAlias.alias || !newAlias.providerId || !newAlias.targetModel}
                >
                  Create Alias
                </Button>
                <Button variant="outline" onClick={() => setShowAddAlias(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {aliases?.map((alias: any) => (
              <div key={alias.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-mono font-medium">{alias.alias}</p>
                  <p className="text-sm text-muted-foreground">
                    → {alias.provider?.name}: {alias.targetModel}
                  </p>
                  {alias.description && (
                    <p className="text-xs text-muted-foreground">{alias.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteAliasMutation.mutate(alias.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {(!aliases || aliases.length === 0) && !showAddAlias && (
              <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                No model aliases configured.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
