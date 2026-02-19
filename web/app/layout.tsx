import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";
import { getServerAccessSession } from "@/lib/api/serverSession";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recipe Platform",
  description: "Recipe browsing and owner visibility management.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Shared session snapshot for global navigation and sign in/out controls.
  const session = await getServerAccessSession();
  const headerSession = session
    ? {
        email: session.user.email,
        role: session.user.role,
        display_name: session.user.display_name ?? "",
      }
    : null;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <div className="min-h-screen">
          <SiteHeader session={headerSession} />

          {children}
        </div>
      </body>
    </html>
  );
}
