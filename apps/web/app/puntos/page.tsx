import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { PointsView } from "@/components/points/points-view";
import { ApiError, getClubs, getFixtures, getMySquadPoints, getRounds } from "@/lib/api";

// Live points are recomputed on every request (and re-fetched via SSE-driven
// router.refresh() during live rounds), so this page can never be static.
export const dynamic = "force-dynamic";

function Notice({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
      <p className="max-w-md text-emerald-100/70">{description}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-2 rounded-full bg-bo-green px-6 py-2.5 text-sm font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-emerald-600"
        >
          {cta.label}
        </Link>
      ) : null}
    </main>
  );
}

export default async function PuntosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fpuntos");
  }

  const t = await getTranslations("points");
  const { fecha } = await searchParams;

  try {
    const rounds = await getRounds();
    if (rounds.length === 0) {
      return <Notice title={t("noRound.title")} description={t("noRound.description")} />;
    }

    // Default: the current round (first non-finalized), or the season's last
    // round once everything is finalized.
    const current =
      rounds.find((round) => round.status !== "finalized") ?? rounds[rounds.length - 1]!;
    const requested = fecha === undefined ? Number.NaN : Number(fecha);
    const selectedRound = rounds.find((round) => round.id === requested) ?? current;

    const [points, fixtures, clubs] = await Promise.all([
      getMySquadPoints(selectedRound.id),
      getFixtures(selectedRound.id),
      getClubs(),
    ]);

    if (!points) {
      return (
        <Notice
          title={t("noSquad.title")}
          description={t("noSquad.description")}
          cta={{ href: "/equipo", label: t("noSquad.cta") }}
        />
      );
    }

    return (
      <PointsView
        rounds={rounds.map(({ id, name }) => ({ id, name }))}
        roundId={selectedRound.id}
        roundName={selectedRound.name}
        points={points}
        fixtures={fixtures}
        clubs={clubs}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?callbackUrl=%2Fpuntos");
    }
    return <Notice title={t("apiDown.title")} description={t("apiDown.description")} />;
  }
}
