import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/hooks/useAuth";
import { DarkModeProvider } from "@/hooks/useDarkMode";
import { ToastManagerProvider } from "@/components/ToastManager";
import { DialogManagerProvider } from "@/components/DialogManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
