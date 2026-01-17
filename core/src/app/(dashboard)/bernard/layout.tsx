import type { Metadata } from "next";
import { AuthProvider } from "@/hooks/useAuth";
import { DarkModeProvider } from "@/hooks/useDarkMode";
import { ToastManagerProvider } from "@/components/ToastManager";
import { DialogManagerProvider } from "@/components/DialogManager";
import { HeaderProvider } from "@/components/chat/HeaderService";
import { SidebarProvider } from "@/components/chat/SidebarProvider";
import { BernardLayoutContent } from "@/components/chat/BernardLayoutContent";
import { ThreadProvider } from "@/providers/ThreadProvider";

export const metadata: Metadata = {
  title: "Bernard",
  description: "Agent, Services, and backbone for the Bernard AI system",
};

export default function BernardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`--font-geist-sans --font-geist-mono antialiased`}>
      <AuthProvider>
        <DarkModeProvider>
          <DialogManagerProvider>
            <ToastManagerProvider>
              <ThreadProvider>
                <SidebarProvider>
                  <HeaderProvider>
                    <BernardLayoutContent>{children}</BernardLayoutContent>
                  </HeaderProvider>
                </SidebarProvider>
              </ThreadProvider>
            </ToastManagerProvider>
          </DialogManagerProvider>
        </DarkModeProvider>
      </AuthProvider>
    </div>
  );
}
