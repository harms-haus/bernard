"use client";

import { Link } from '@/lib/router/compat';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Key } from 'lucide-react';

export function UserPanel() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>
                Update your profile information and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/bernard/user/profile">
                <Button variant="outline" className="w-full">
                  Manage Profile
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Access Tokens
              </CardTitle>
              <CardDescription>
                Manage your API access tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/bernard/user/tokens">
                <Button variant="outline" className="w-full">
                  Manage Tokens
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
