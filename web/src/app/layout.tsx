import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import NavLinks from "@/components/NavLinks";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Route Advisor",
  description: "Pick a route for each shipment, balancing price, time and risk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-paper text-ink font-sans flex flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-card focus:text-ink focus:px-4 focus:py-3 focus:rounded-xl focus:shadow-md"
        >
          Skip to the main content
        </a>
        <header className="bg-card border-b border-line sticky top-0 z-40">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-ink no-underline group min-h-[44px]"
              aria-label="Route Advisor Home"
            >
              <div className="w-9 h-9 rounded-[10px] bg-ink flex items-center justify-center transition-transform group-hover:scale-105">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="18" r="2.5"></circle>
                  <circle cx="19" cy="6" r="2.5"></circle>
                  <path d="M7.5 18H14a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6.5"></path>
                </svg>
              </div>
              <span className="font-heading font-bold text-[19px] tracking-[-0.01em]">
                Route Advisor
              </span>
            </Link>

            <NavLinks />
          </div>
        </header>

        <main id="main" className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {children}
        </main>

        <footer className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 pb-14 border-t border-line mt-auto flex flex-wrap justify-between gap-3 text-xs sm:text-[13px] text-muted">
          <span>
            The shipments are made up, but the ports and distances are real. Prices and risks are estimates.
          </span>
          <span>
            The route is always chosen by the numbers, never by an AI.
          </span>
        </footer>
      </body>
    </html>
  );
}
