import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { Home } from './pages/Home'
import { About } from './pages/About'
import { Login } from './pages/Login'
import { Chat } from './pages/Chat'
import { Profile } from './pages/Profile'
import { Keys } from './pages/Keys'
import { UserBadge } from './components/UserBadge'
import { DarkModeToggle } from './components/DarkModeToggle'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './components/AdminLayout'
import { DarkModeProvider } from './hooks/useDarkMode'
import Dashboard from './pages/admin/Dashboard'
import History from './pages/admin/History'
import Models from './pages/admin/Models'
import Users from './pages/admin/Users'
import ConversationDetail from './pages/admin/ConversationDetail'

// Admin protected route component
function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  // AdminLayout will handle the useAdminAuth check
  // We don't need to call it here to avoid duplicate getCurrentUser calls
  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                  <div className="flex items-center">
                    <Link to="/" className="text-xl font-semibold text-gray-900 dark:text-white">
                      Bernard UI
                    </Link>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Link
                      to="/"
                      className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Home
                    </Link>
                    <Link
                      to="/chat"
                      className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Chat
                    </Link>
                    <Link
                      to="/profile"
                      className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Profile
                    </Link>
                    <Link
                      to="/keys"
                      className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      Keys
                    </Link>
                    <Link
                      to="/about"
                      className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      About
                    </Link>
                    <DarkModeToggle />
                    <UserBadge />
                  </div>
                </div>
              </div>
            </nav>

            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Home />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat"
                  element={
                    <ProtectedRoute>
                      <Chat />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/keys"
                  element={
                    <ProtectedRoute>
                      <Keys />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/about"
                  element={
                    <ProtectedRoute>
                      <About />
                    </ProtectedRoute>
                  }
                />
                
                {/* Admin routes */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminProtectedRoute>
                        <AdminLayout />
                      </AdminProtectedRoute>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="models" element={<Models />} />
                  <Route path="history" element={<History />} />
                  <Route path="history/:id" element={<ConversationDetail />} />
                  <Route path="users" element={<Users />} />
                </Route>
              </Routes>
            </main>
          </div>
        </Router>
      </DarkModeProvider>
    </AuthProvider>
  )
}

export default App