import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  title: "Route Advisor - Plan a Shipment",
  description: "Find the best route for every package, balancing cost, time, and safety.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen bg-paper text-ink font-sans flex flex-col antialiased">
        <header className="bg-card border-b border-line sticky top-0 z-40">
          <div className="max-w-[1200px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-ink no-underline group"
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

            <nav className="flex flex-wrap gap-1.5" aria-label="Main">
              <Link
                href="/"
                className="text-ink font-semibold text-[15px] px-3.5 py-2 rounded-full hover:bg-ocean transition-colors min-h-[44px] flex items-center"
              >
                Plan a shipment
              </Link>
              <Link
                href="/how"
                className="text-muted font-medium text-[15px] px-3.5 py-2 rounded-full hover:bg-ocean hover:text-ink transition-colors min-h-[44px] flex items-center"
              >
                How it decides
              </Link>
              <Link
                href="/results"
                className="text-muted font-medium text-[15px] px-3.5 py-2 rounded-full hover:bg-ocean hover:text-ink transition-colors min-h-[44px] flex items-center"
              >
                Does it work?
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-10">
          {children}
        </main>

        <footer className="max-w-[1200px] w-full mx-auto px-6 py-8 pb-14 border-t border-line mt-auto flex flex-wrap justify-between gap-3 text-[13px] text-subtle">
          <span>
            Made-up shipments on real trade lanes. Ports and distances are real; prices and risks are estimates.
          </span>
          <span>
            An optional AI writes the explanations. It never chooses the route.
          </span>
        </footer>
      </body>
    </html>
  );
}
