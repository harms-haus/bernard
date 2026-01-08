export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
        {children}
      </body>
    </html>
  )
}
