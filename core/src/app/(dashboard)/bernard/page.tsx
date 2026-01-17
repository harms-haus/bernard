import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

export default function Home() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to Bernard</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            Your AI agent platform for home automation and intelligent assistance
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bernard AI Platform</CardTitle>
            <CardDescription>
              A production-grade AI agent platform that combines LangGraph-powered reasoning with integrated speech services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-secondary/50 rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">Quick Actions</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Start a conversation</li>
                  <li>• View task history</li>
                  <li>• Check system status</li>
                </ul>
              </div>
              <div className="bg-secondary/50 rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-2">Recent Activity</h3>
                <p className="text-sm text-muted-foreground">
                  No recent conversations. Start chatting to see activity here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
