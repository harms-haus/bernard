import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '../components/ui/card'

export function About() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>About Bernard UI</CardTitle>
            <CardDescription>
              Project setup and technology stack
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Frontend</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• React 18 with TypeScript</li>
                  <li>• Vite build tool</li>
                  <li>• React Router for navigation</li>
                  <li>• Tailwind CSS for styling</li>
                </ul>
              </div>
              <div className="bg-gray-100 p-4 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">UI Components</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Radix-UI primitives</li>
                  <li>• Accessible components</li>
                  <li>• Headless components</li>
                  <li>• Custom styling with Tailwind</li>
                </ul>
              </div>
            </div>
            <p className="text-gray-600">
              This project provides a solid foundation for building modern React
              applications with excellent accessibility and developer experience.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}