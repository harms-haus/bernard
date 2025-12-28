import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { About } from './pages/About'
import { Login } from './pages/Login'
import { Chat } from './pages/Chat'
import { Profile } from './pages/Profile'
import { Keys } from './pages/Keys'
import { AuthProvider } from './hooks/useAuth'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './components/AdminLayout'
import { UserLayout } from './components/UserLayout'
import { DarkModeProvider } from './hooks/useDarkMode'
import Dashboard from './pages/admin/Dashboard'
import History from './pages/admin/History'
import Models from './pages/admin/Models'
import Services from './pages/admin/Services'
import Users from './pages/admin/Users'
import Automations from './pages/admin/Automations'
import ConversationDetail from './pages/admin/ConversationDetail'
import { Tasks } from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import { StatusPage } from './pages/StatusPage'
import { DialogManagerProvider, ToastManagerProvider } from './components'

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
        <DialogManagerProvider>
          <ToastManagerProvider>
            <Router basename="/bernard/">
            <Routes>
              <Route path="/login" element={<Login />} />

              {/* User routes with navigation */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <UserLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Home />} />
                <Route path="chat" element={<Chat />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route path="keys" element={<Keys />} />
                <Route path="about" element={<About />} />
              </Route>

              {/* Public status page */}
              <Route path="/status" element={<StatusPage />} />

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
                <Route path="services" element={<Services />} />
                <Route path="history" element={<History />} />
                <Route path="history/:id" element={<ConversationDetail />} />
                <Route path="users" element={<Users />} />
                <Route path="automations" element={<Automations />} />
              </Route>
            </Routes>
          </Router>
          </ToastManagerProvider>
        </DialogManagerProvider>
      </DarkModeProvider>
    </AuthProvider>
  )
}

export default App