import { Outlet } from 'react-router-dom'
import { AuthProvider } from "@/hooks/useAuth"
import { DarkModeProvider } from "@/hooks/useDarkMode"
import { ToastManagerProvider } from "@/components/ToastManager"
import { DialogManagerProvider } from "@/components/DialogManager"
import { DynamicHeaderProvider } from "@/components/dynamic-header"
import { DynamicSidebarProvider } from "@/components/dynamic-sidebar"
import { BernardLayoutContent } from "@/components/chat/BernardLayoutContent"
import { ThreadProvider } from "@/providers/ThreadProvider"

export function BernardLayout() {
  return (
    <div className="antialiased">
      <AuthProvider>
        <DarkModeProvider>
          <DialogManagerProvider>
            <ToastManagerProvider>
              <ThreadProvider>
                <DynamicSidebarProvider>
                  <DynamicHeaderProvider>
                    <BernardLayoutContent>
                      <Outlet />
                    </BernardLayoutContent>
                  </DynamicHeaderProvider>
                </DynamicSidebarProvider>
              </ThreadProvider>
            </ToastManagerProvider>
          </DialogManagerProvider>
        </DarkModeProvider>
      </AuthProvider>
    </div>
  )
}
