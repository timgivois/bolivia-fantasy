import { getTranslations } from "next-intl/server";

/**
 * Titled empty state for pages that later tasks will build out
 * (squad builder, leagues, leaderboards, admin).
 */
export async function ComingSoon({ namespace }: { namespace: string }) {
  const [t, tCommon] = await Promise.all([getTranslations(namespace), getTranslations("common")]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-white">{t("title")}</h1>
      <p className="max-w-md text-emerald-100/70">{t("description")}</p>
      <span className="mt-2 rounded-full border border-bo-yellow/40 bg-bo-yellow/10 px-4 py-1 text-sm font-medium tracking-wide text-bo-yellow uppercase">
        {tCommon("comingSoon")}
      </span>
    </main>
  );
}
