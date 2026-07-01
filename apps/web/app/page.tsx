import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 px-6 text-center text-white">
      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-1 text-sm font-medium tracking-wide text-emerald-300 uppercase">
        {t("comingSoon")}
      </span>
      <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">{t("title")}</h1>
      <p className="text-lg font-medium text-emerald-200">{t("tagline")}</p>
      <p className="max-w-xl text-base text-emerald-100/80">{t("description")}</p>
    </main>
  );
}
