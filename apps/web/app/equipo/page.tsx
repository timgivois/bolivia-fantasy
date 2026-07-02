import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { CreateSquadForm } from "@/components/squad/create-squad-form";
import { SquadBuilder } from "@/components/squad/squad-builder";
import type { RoundInfo } from "@/components/squad/types";
import { ApiError, getAllPlayers, getClubs, getCurrentRound, getMySquad } from "@/lib/api";

// The page reads the session cookie and live game data on every request.
export const dynamic = "force-dynamic";

/** Mirrors apps/api isRoundLocked: only an upcoming round before lockAt is open. */
function isRoundLocked(round: RoundInfo): boolean {
  if (round.status !== "upcoming") return true;
  return round.lockAt !== null && Date.parse(round.lockAt) <= Date.now();
}

function Notice({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
      <p className="max-w-md text-emerald-100/70">{description}</p>
    </main>
  );
}

export default async function EquipoPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fequipo");
  }

  const t = await getTranslations("squad");

  try {
    const [round, clubs, players, mySquad] = await Promise.all([
      getCurrentRound(),
      getClubs(),
      getAllPlayers(),
      getMySquad(),
    ]);

    if (!mySquad) {
      return <CreateSquadForm />;
    }

    if (!round) {
      return <Notice title={t("noRound.title")} description={t("noRound.description")} />;
    }

    return (
      <SquadBuilder
        squadName={mySquad.squad.name}
        roundId={round.id}
        roundName={round.name}
        lockAt={round.lockAt}
        initialLocked={isRoundLocked(round)}
        clubs={clubs}
        players={players}
        savedPicks={mySquad.picks}
      />
    );
  } catch (error) {
    // An expired/invalid session token means the API rejects /me calls even
    // though the Next.js session still parses: send the user back to login.
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?callbackUrl=%2Fequipo");
    }
    return <Notice title={t("apiDown.title")} description={t("apiDown.description")} />;
  }
}
