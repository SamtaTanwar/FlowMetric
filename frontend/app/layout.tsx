import { Toaster } from "sonner";
import type { Metadata } from "next";
import "./globals.css";
import InitialLoader from "./components/InitialLoader";

export const metadata: Metadata = {
  title: "Employee Workflow Tracking",
  description: "Employee workflow tracking and productivity monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <InitialLoader>{children}</InitialLoader>

        <Toaster
          position="top-right"
          richColors
          theme="dark"
        />
      </body>
    </html>
  );
}
