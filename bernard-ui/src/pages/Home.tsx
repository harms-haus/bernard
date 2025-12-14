import { useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '../components/ui/card'

export function Home() {
  const [count, setCount] = useState(0)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Bernard UI</CardTitle>
            <CardDescription>
              A React + Vite + Radix-UI project with Tailwind CSS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <p className="text-gray-600 dark:text-gray-300">
               This is a basic setup with routing and styling. You can now build
               your application on top of this foundation.
             </p>
             <div className="flex items-center space-x-4">
               <button
                 onClick={() => setCount(count + 1)}
                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
               >
                 Count: {count}
               </button>
               <span className="text-sm text-gray-500 dark:text-gray-400">
                 Click the button to see state management in action
               </span>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}