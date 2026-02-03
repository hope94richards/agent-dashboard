import "./globals.css";

export const metadata = {
  title: "Agent Dashboard",
  description: "AI assistant dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-white" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
