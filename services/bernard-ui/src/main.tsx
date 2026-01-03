import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { StreamProvider } from './providers/StreamProvider'
import { ThreadProvider } from './providers/ThreadProvider'
import { Toaster } from 'sonner'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThreadProvider>
      <StreamProvider>
        <App />
      </StreamProvider>
    </ThreadProvider>
    <Toaster />
  </React.StrictMode>,
)