import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bernard",
  description: "AI Assistant",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
