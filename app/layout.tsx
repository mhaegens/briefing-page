import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Briefing Hub — one thing at a time",
  description: "A calm, private place to review briefings from your agents.",
  applicationName: "Briefing Hub",
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport: Viewport = {
  themeColor: "#1737d0",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
