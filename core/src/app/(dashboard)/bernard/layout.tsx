import type { Metadata } from "next";
import { AuthProvider } from "@/hooks/useAuth";
import { DarkModeProvider } from "@/hooks/useDarkMode";
import { ToastManagerProvider } from "@/components/ToastManager";
import { DialogManagerProvider } from "@/components/DialogManager";

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
              {children}
            </ToastManagerProvider>
          </DialogManagerProvider>
        </DarkModeProvider>
      </AuthProvider>
    </div>
  );
}
