import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { UserSidebarConfig } from '@/components/dynamic-sidebar/configs';

export default function About() {
  return (
    <UserSidebarConfig>
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">About Bernard</h1>
            <p className="text-muted-foreground mt-1">
              Technology stack and project information
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Frontend</CardTitle>
                <CardDescription>React + TypeScript</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• React 18 with TypeScript</li>
                  <li>• Next.js 15+ framework</li>
                  <li>• Tailwind CSS for styling</li>
                  <li>• Framer Motion animations</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>UI Components</CardTitle>
                <CardDescription>Accessible primitives</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Radix-UI primitives</li>
                  <li>• Shadcn/ui component library</li>
                  <li>• Custom design system</li>
                  <li>• Dark mode optimized</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Backend Services</CardTitle>
                <CardDescription>Microservices architecture</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• LangGraph agent (port 2024)</li>
                  <li>• Whisper.cpp STT (port 8870)</li>
                  <li>• Kokoro TTS (port 8880)</li>
                  <li>• Redis for state (port 6379)</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Features</CardTitle>
                <CardDescription>Core capabilities</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• AI-powered conversations</li>
                  <li>• Home automation tools</li>
                  <li>• Media management</li>
                  <li>• Real-time status monitoring</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </UserSidebarConfig>
  );
}
