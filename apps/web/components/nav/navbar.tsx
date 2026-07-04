import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/logo";
import { MobileTabBar } from "@/components/nav/mobile-tab-bar";
import { NavLinks } from "@/components/nav/nav-links";
import { UserMenu } from "@/components/nav/user-menu";

export async function Navbar() {
  const t = await getTranslations("common");

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-pitch-950/90 backdrop-blur">
        {/* Bolivian tricolor accent line */}
        <div className="grid h-0.5 grid-cols-3">
          <span className="bg-bo-red" />
          <span className="bg-bo-yellow" />
          <span className="bg-bo-green" />
        </div>
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo label={t("appName")} />
          <NavLinks />
          <UserMenu />
        </nav>
      </header>
      <MobileTabBar />
    </>
  );
}
