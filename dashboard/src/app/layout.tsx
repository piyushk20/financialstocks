import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NSE 200 Stock Dashboard",
  description: "Elite stock analysis dashboard for India's NSE 200 — real-time price, financials, technicals, and AI-powered analysis.",
  keywords: ["NSE", "stock dashboard", "Indian stocks", "technical analysis", "fundamental analysis"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} dark`} suppressHydrationWarning>
      <body className="bg-[#0a0a0f] text-zinc-100 antialiased min-h-screen font-[var(--font-inter)]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
