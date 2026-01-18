import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            You don&apos;t have admin privileges to access this area.
          </p>
          <div className="flex gap-2">
            <Button asChild>
                <Link href="/bernard/chat" className="flex items-center">
                  <Home className="mr-2 h-4 w-4" />
                  Back to Chat
                </Link>
              </Button>
            <Button variant="outline" asChild>
              <Link href="/bernard/user/profile">Profile</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
