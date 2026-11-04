import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "./lib/query-provider";
import { AuthProvider } from "./lib/auth-context";
import { NavShell } from "./components/NavShell";

export const metadata: Metadata = {
  title: "MedCore HMS — Multi-Tenant Hospital Management SaaS",
  description: "Enterprise healthcare operations, clinical management, and appointment scheduling.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>
            <NavShell>{children}</NavShell>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
