import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from './components/DashboardLayout'
import { BernardLayout } from './components/BernardLayout'
import { ChatLayout } from './components/ChatLayout'
import { AdminLayoutWrapper } from './components/AdminLayout'
import { UserLayoutWrapper } from './components/UserLayout'

// Public routes
import { Login } from './pages/Login'
import { Logout } from './pages/Logout'
import { VerifyAdmin } from './pages/VerifyAdmin'
import { Forbidden } from './pages/Forbidden'
import { Status } from './pages/Status'

// Bernard routes
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { About } from './pages/About'

// Import all migrated pages
import { Profile } from './pages/Profile'
import { Keys } from './pages/Keys'
import { AdminPanel } from './pages/AdminPanel'
import { Tasks } from './pages/Tasks'
import { TaskDetail } from './pages/TaskDetail'
import { UserPanel } from './pages/UserPanel'
import { Models } from './pages/Models'
import { Services } from './pages/Services'
import { Users } from './pages/Users'
import { Jobs } from './pages/Jobs'
import { JobDetail } from './pages/JobDetail'

function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-100">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4">404</h1>
        <p className="text-xl text-slate-400 mb-8">Page not found</p>
        <a href="/bernard" className="text-blue-400 hover:text-blue-300 underline">
          Go to Home
        </a>
      </div>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/bernard" replace />} />

          {/* Public routes (no auth required) */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/verify-admin" element={<VerifyAdmin />} />
          <Route path="/auth/logout" element={<Logout />} />
          <Route path="/status" element={<Status />} />
          <Route path="/403" element={<Forbidden />} />

          {/* Protected bernard routes */}
          <Route element={<BernardLayout />}>
            <Route path="/bernard" element={<Home />} />
            <Route element={<ChatLayout />}>
              <Route path="/bernard/chat" element={<Chat />} />
            </Route>
            <Route path="/bernard/about" element={<About />} />
            <Route path="/bernard/tasks" element={<Tasks />} />
            <Route path="/bernard/tasks/:id" element={<TaskDetail />} />

            {/* User routes (CLIENT-SIDE auth via useAuth() hook) */}
            <Route path="/bernard/user" element={<UserLayoutWrapper />}>
              <Route index element={<UserPanel />} />
              <Route path="tokens" element={<Keys />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            {/* Admin routes */}
            <Route path="/bernard/admin" element={<AdminLayoutWrapper />}>
              <Route index element={<AdminPanel />} />
              <Route path="models" element={<Models />} />
              <Route path="services" element={<Services />} />
              <Route path="users" element={<Users />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="jobs/:jobId" element={<JobDetail />} />
            </Route>
          </Route>

          {/* 404 catch-all */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
