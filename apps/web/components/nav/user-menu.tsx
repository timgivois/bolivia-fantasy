import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auth, signOut } from "@/auth";

/**
 * Server component: shows a sign-in CTA when logged out, or an avatar
 * dropdown (no-JS friendly <details>) with a sign-out server action.
 */
export async function UserMenu() {
  const [session, t] = await Promise.all([auth(), getTranslations("nav")]);

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-bo-yellow px-4 py-1.5 text-sm font-bold text-pitch-950 transition-colors hover:bg-yellow-300"
      >
        {t("signIn")}
      </Link>
    );
  }

  const { name, email, image } = session.user;
  const initial = (name ?? email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <details className="group relative">
      <summary
        className="flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden"
        aria-label={t("openUserMenu")}
      >
        {image ? (
          // Plain <img>: remote avatar hosts vary per OAuth provider, so
          // next/image remotePatterns would need constant upkeep.
          <img
            src={image}
            alt={name ?? ""}
            className="h-9 w-9 rounded-full ring-2 ring-bo-yellow/60"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bo-green text-sm font-bold text-white ring-2 ring-bo-yellow/60">
            {initial}
          </span>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-pitch-900 shadow-xl shadow-black/40">
        <div className="border-b border-white/10 px-4 py-3">
          {name ? <p className="truncate text-sm font-semibold text-white">{name}</p> : null}
          {email ? <p className="truncate text-xs text-emerald-100/70">{email}</p> : null}
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full px-4 py-3 text-left text-sm font-semibold text-red-300 transition-colors hover:bg-white/5"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
    </details>
  );
}
