import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are self-hosted from npm packages so builds never depend on Google Fonts being reachable.
const sora = localFont({
  variable: "--font-sora",
  display: "swap",
  src: "../../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2",
  weight: "100 800",
});

const unbounded = localFont({
  variable: "--font-unbounded",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/unbounded/files/unbounded-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/unbounded/files/unbounded-latin-600-normal.woff2", weight: "600" },
  ],
});

export const metadata: Metadata = {
  title: "Lumen — inference fleet console",
  description:
    "Watch live traffic across an AI model fleet, reroute it, set alert limits, ask the ops assistant and plan token costs.",
};

export const viewport: Viewport = {
  themeColor: "#0e1033",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${unbounded.variable} antialiased`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
