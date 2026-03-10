'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => auth.me().then((res) => res.data),
  });

  const apiKey = user?.apiKeys?.[0]?.key || 'Generate an API key to use the gateway';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and API keys</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input value={user?.name || ''} readOnly />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input value={user?.email || ''} readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle>API Key</CardTitle>
          <CardDescription>
            Use this key to authenticate requests to the gateway
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="password"
              value={apiKey}
              readOnly
              className="font-mono"
            />
            <Button variant="outline" onClick={copyToClipboard}>
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Include this key in the Authorization header: <code>Bearer YOUR_API_KEY</code>
          </p>
        </CardContent>
      </Card>

      {/* API Endpoint */}
      <Card>
        <CardHeader>
          <CardTitle>API Endpoint</CardTitle>
          <CardDescription>
            Configure your applications to use this endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4 font-mono text-sm">
            <p>Base URL: <span className="text-primary">{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}</span></p>
            <p className="mt-2">Chat Completions: <span className="text-primary">/v1/chat/completions</span></p>
            <p>Models: <span className="text-primary">/v1/models</span></p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium mb-2">Example Request</p>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`curl ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "smart",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
