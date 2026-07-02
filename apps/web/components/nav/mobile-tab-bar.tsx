"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { isActivePath, NAV_LINKS, type NavKey } from "./links";

function TabIcon({ name, className }: { name: NavKey; className?: string }) {
  const common = {
    className,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
        </svg>
      );
    case "team":
      // Football shirt
      return (
        <svg {...common}>
          <path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3a3 3 0 0 1-6 0Z" />
        </svg>
      );
    case "leagues":
      // Trophy
      return (
        <svg {...common}>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
          <path d="M12 14v3M8.5 21h7M10 21v-2h4v2" />
        </svg>
      );
    case "standings":
      // Ranking bars
      return (
        <svg {...common}>
          <path d="M4 20V12M12 20V4M20 20v-6" />
          <path d="M3 20h18" />
        </svg>
      );
  }
}

export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-pitch-900/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-4">
        {NAV_LINKS.map(({ href, key }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                active ? "text-bo-yellow" : "text-emerald-100/70 hover:text-white"
              }`}
            >
              <TabIcon name={key} className="h-5 w-5" />
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
