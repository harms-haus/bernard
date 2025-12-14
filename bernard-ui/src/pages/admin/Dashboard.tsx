import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { 
  LayoutDashboard, 
  Settings, 
  MessagesSquare, 
  Users 
} from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-300">Welcome to the Bernard admin panel</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          Admin Area
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Models</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Configure</div>
            <p className="text-xs text-muted-foreground">
              Manage AI providers and model configurations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">History</CardTitle>
            <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Review</div>
            <p className="text-xs text-muted-foreground">
              View and manage conversation history
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Manage</div>
            <p className="text-xs text-muted-foreground">
              Create and manage user accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System</CardTitle>
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Monitor</div>
            <p className="text-xs text-muted-foreground">
              System status and configuration
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Get started with common administrative tasks
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <h4 className="font-semibold">Models & Providers</h4>
            <p className="text-sm text-muted-foreground">
              Configure AI providers and assign models to different harnesses
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold">Conversation Management</h4>
            <p className="text-sm text-muted-foreground">
              Review, search, and manage user conversations
            </p>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold">User Administration</h4>
            <p className="text-sm text-muted-foreground">
              Create, disable, and manage user accounts
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>
            Current status and configuration details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Admin Panel</h4>
              <p className="text-sm text-muted-foreground">
                This is the administrative interface for managing Bernard system settings, users, and conversations.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Access Control</h4>
              <p className="text-sm text-muted-foreground">
                Access to this area requires admin privileges. Ensure only trusted users have admin access.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}