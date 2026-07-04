import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { BallIcon } from "@/components/logo";

const iconProps = {
  className: "h-6 w-6",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
} as const;

export default async function HomePage() {
  const [session, t] = await Promise.all([auth(), getTranslations("home")]);
  const primaryHref = session ? "/equipo" : "/login";

  const features = [
    {
      key: "squad" as const,
      icon: (
        <svg {...iconProps}>
          <path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3a3 3 0 0 1-6 0Z" />
        </svg>
      ),
    },
    {
      key: "points" as const,
      icon: <BallIcon className="h-6 w-6" />,
    },
    {
      key: "leagues" as const,
      icon: (
        <svg {...iconProps}>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
          <path d="M12 14v3M8.5 21h7M10 21v-2h4v2" />
        </svg>
      ),
    },
  ];

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-pitch-900 via-pitch-950 to-pitch-950">
        {/* Pitch center-circle backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 h-[52rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/15"
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
          <span className="rounded-full border border-bo-yellow/40 bg-bo-yellow/10 px-4 py-1 text-sm font-medium tracking-wide text-bo-yellow uppercase">
            {t("hero.badge")}
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="text-lg font-medium text-emerald-200">{t("hero.tagline")}</p>
          <p className="max-w-xl text-base text-emerald-100/80">{t("hero.description")}</p>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="rounded-full bg-bo-yellow px-8 py-3 text-base font-bold text-pitch-950 shadow-lg shadow-bo-yellow/20 transition-colors hover:bg-yellow-300"
            >
              {session ? t("hero.ctaSignedIn") : t("hero.ctaSignedOut")}
            </Link>
            <Link
              href="/clasificacion"
              className="rounded-full border border-emerald-400/40 px-8 py-3 text-base font-semibold text-emerald-100 transition-colors hover:bg-white/5"
            >
              {t("hero.secondaryCta")}
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">{t("howItWorks.title")}</h2>
          <p className="mt-3 text-emerald-100/70">{t("howItWorks.subtitle")}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map(({ key, icon }) => (
            <article
              key={key}
              className="rounded-2xl border border-white/10 bg-pitch-900/60 p-6 transition-colors hover:border-bo-yellow/30"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bo-yellow/15 text-bo-yellow ring-1 ring-bo-yellow/30">
                {icon}
              </span>
              <h3 className="mb-2 text-lg font-bold text-white">{t(`howItWorks.${key}.title`)}</h3>
              <p className="text-sm leading-relaxed text-emerald-100/70">
                {t(`howItWorks.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-white/10 bg-pitch-900/40">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{t("cta.title")}</h2>
          <p className="text-emerald-100/70">{t("cta.description")}</p>
          <Link
            href={primaryHref}
            className="mt-2 rounded-full bg-bo-green px-8 py-3 text-base font-bold text-white ring-1 ring-emerald-400/40 transition-colors hover:bg-emerald-700"
          >
            {t("cta.button")}
          </Link>
        </div>
      </section>
    </main>
  );
}
