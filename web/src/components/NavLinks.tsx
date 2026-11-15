"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Plan a shipment" },
  { href: "/how", label: "How it decides" },
  { href: "/results", label: "Does it work?" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 sm:gap-2" aria-label="Main">
      {LINKS.map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`text-sm sm:text-[15px] px-3 sm:px-4 rounded-full min-h-[44px] flex items-center transition-colors ${
              active ? "bg-ocean text-ink font-semibold" : "text-muted font-medium hover:bg-ocean hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
