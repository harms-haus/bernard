import type { ReactNode } from "react";

export const metadata = {
  title: "Arthur Agent API",
  description: "Agentic proxy with LangGraph and scripted tools"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

