"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { isActivePath, NAV_LINKS } from "./links";

export function NavLinks() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <div className="hidden items-center gap-1 md:flex">
      {NAV_LINKS.map(({ href, key }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-bo-yellow/15 text-bo-yellow"
                : "text-emerald-100/80 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t(key)}
          </Link>
        );
      })}
    </div>
  );
}
