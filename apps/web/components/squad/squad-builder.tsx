"use client";

import {
  SQUAD_COMPOSITION,
  validateSquad,
  type SquadPick as ScoringPick,
} from "@bolivia-fantasy/scoring";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useReducer, useState, useTransition } from "react";

import { savePicksAction, transferAction } from "@/app/equipo/actions";

import { errorFeedbackKey } from "./errors";
import { LockCountdown } from "./lock-countdown";
import { Picker } from "./picker";
import { Pitch } from "./pitch";
import {
  BUDGET,
  POSITIONS,
  SQUAD_SIZE,
  allPlayers,
  budgetRemaining,
  builderReducer,
  canAddPlayer,
  canSwap,
  clubCounts as computeClubCounts,
  countByPosition,
  draftPrice,
  initBuilderState,
  round1,
  squadCost,
  swapTargets as computeSwapTargets,
  type Feedback,
  type FeedbackMessage,
} from "./reducer";
import type {
  Club,
  PickInput,
  PlayerLite,
  Position,
  SavedPick,
  ValidationErrorLike,
} from "./types";

export interface SquadBuilderProps {
  squadName: string;
  roundId: number;
  roundName: string;
  lockAt: string | null;
  initialLocked: boolean;
  clubs: Club[];
  players: PlayerLite[];
  savedPicks: SavedPick[];
}

export function SquadBuilder({
  squadName,
  roundId,
  roundName,
  lockAt,
  initialLocked,
  clubs,
  players,
  savedPicks,
}: SquadBuilderProps) {
  const t = useTranslations("squad");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickerTab, setPickerTab] = useState<Position | "ALL">("ALL");

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const [state, dispatch] = useReducer(
    builderReducer,
    { savedPicks, playersById, locked: initialLocked },
    initBuilderState,
  );

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------
  const squad = allPlayers(state);
  const totalPlayers = squad.length;
  const spent = squadCost(state);
  const remaining = budgetRemaining(state);
  const composition = countByPosition(squad);
  const clubCounts = computeClubCounts(state);
  const inSquadIds = useMemo(() => new Set(squad.map((p) => p.id)), [squad]);
  const swapTargets = computeSwapTargets(state);
  const menuPlayer = state.menuId !== null ? squad.find((p) => p.id === state.menuId) : undefined;
  const transferOut =
    state.transferOutId !== null ? squad.find((p) => p.id === state.transferOutId) : undefined;
  const swapPlayer = state.swapId !== null ? squad.find((p) => p.id === state.swapId) : undefined;

  const clubLabel = useCallback(
    (clubId: number | string): string => {
      const club = clubsById.get(Number(clubId));
      return club?.shortName ?? club?.name ?? String(clubId);
    },
    [clubsById],
  );

  const priceOf = (player: PlayerLite) => draftPrice(state, player);

  // -------------------------------------------------------------------------
  // Feedback helpers
  // -------------------------------------------------------------------------
  const showFeedback = (feedback: Feedback) => dispatch({ type: "FEEDBACK", feedback });

  /** Translate scoring/API validation errors into renderable messages. */
  const describeValidation = (errors: ValidationErrorLike[]): FeedbackMessage[] =>
    errors.map((error) => {
      const values: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(error.context ?? {})) {
        if (typeof value === "string" || typeof value === "number") values[key] = value;
      }
      if (error.context && "club" in error.context) {
        values.club = clubLabel(String(error.context.club));
      }
      if (typeof error.context?.position === "string") {
        values.position = t(`positions.${error.context.position}`);
      }
      return { key: errorFeedbackKey(error.code), values };
    });

  const feedbackFromFailure = (code: string, validation?: ValidationErrorLike[]): Feedback => ({
    kind: "error",
    key: errorFeedbackKey(code),
    extra: validation ? describeValidation(validation) : undefined,
  });

  // -------------------------------------------------------------------------
  // Transfers
  // -------------------------------------------------------------------------
  const performTransfer = (incoming: PlayerLite) => {
    if (!transferOut || pending) return;
    // Live pre-checks with Spanish feedback before hitting the API.
    if (incoming.clubId !== null) {
      const count =
        (clubCounts.get(incoming.clubId) ?? 0) -
        (transferOut.clubId === incoming.clubId ? 1 : 0);
      if (count >= 3) {
        showFeedback({
          kind: "error",
          key: "feedback.clubLimit",
          values: { max: 3, club: clubLabel(incoming.clubId) },
        });
        return;
      }
    }
    const afterBudget = round1(remaining + draftPrice(state, transferOut) - incoming.price);
    if (afterBudget < 0) {
      showFeedback({
        kind: "error",
        key: "feedback.transferBudget",
        values: { name: incoming.name, remaining: afterBudget.toFixed(1) },
      });
      return;
    }

    const outId = transferOut.id;
    const outName = transferOut.name;
    startTransition(async () => {
      const result = await transferAction(roundId, outId, incoming.id);
      if (result.ok) {
        dispatch({
          type: "TRANSFER_DONE",
          outId,
          player: incoming,
          budget: result.data.budget,
          feedback: {
            kind: "success",
            key: "transfers.success",
            values: { out: outName, in: incoming.name },
          },
        });
        router.refresh();
      } else {
        showFeedback(feedbackFromFailure(result.code, result.validation));
      }
    });
  };

  // -------------------------------------------------------------------------
  // Adding players / picker selection
  // -------------------------------------------------------------------------
  const handlePickerSelect = (player: PlayerLite) => {
    if (state.locked) return;
    if (state.transferOutId !== null) {
      performTransfer(player);
      return;
    }
    const check = canAddPlayer(state, player);
    if (check.ok) {
      dispatch({ type: "ADD_PLAYER", player, target: check.target });
      return;
    }
    const values: Record<string, string | number> = {
      name: player.name,
      position: t(`positions.${player.position}`),
      price: player.price.toFixed(1),
      remaining: remaining.toFixed(1),
      max: check.context?.max ?? 3,
      club: player.clubId !== null ? clubLabel(player.clubId) : "",
    };
    showFeedback({ kind: "error", key: `feedback.${check.reason}`, values });
  };

  // -------------------------------------------------------------------------
  // Pitch interactions (tap menu + swaps)
  // -------------------------------------------------------------------------
  const handleCardTap = (player: PlayerLite) => {
    if (state.locked) return;
    if (state.swapId !== null) {
      if (swapTargets.has(player.id)) {
        const swapIsStarter = state.starters.some((p) => p.id === state.swapId);
        dispatch({
          type: "APPLY_SWAP",
          starterId: swapIsStarter ? state.swapId : player.id,
          benchId: swapIsStarter ? player.id : state.swapId,
        });
      } else {
        dispatch({ type: "CANCEL_SWAP" });
      }
      return;
    }
    dispatch({ type: "OPEN_MENU", id: player.id });
  };

  const handleEmptySlotTap = (position: Position) => {
    setPickerTab(position);
  };

  const onExpire = useCallback(() => dispatch({ type: "LOCK" }), []);

  // -------------------------------------------------------------------------
  // Save (PUT /me/squad/picks)
  // -------------------------------------------------------------------------
  const buildPicks = (): { picks: PickInput[]; ordered: PlayerLite[] } => {
    const orderedStarters = POSITIONS.flatMap((position) =>
      state.starters.filter((p) => p.position === position),
    );
    const ordered = [...orderedStarters, ...state.bench];
    const picks: PickInput[] = ordered.map((player, index) => ({
      playerId: player.id,
      position: index + 1,
      isCaptain: index < 11 && player.id === state.captainId,
      isViceCaptain: index < 11 && player.id === state.viceId,
    }));
    return { picks, ordered };
  };

  const handleSave = () => {
    if (pending || state.locked) return;
    const { picks, ordered } = buildPicks();

    // Client-side pre-validation with the same engine the API uses.
    const scoringPicks: ScoringPick[] = ordered.map((player, index) => ({
      playerId: String(player.id),
      position: index + 1,
      isCaptain: index < 11 && player.id === state.captainId,
      isViceCaptain: index < 11 && player.id === state.viceId,
      fieldPosition: player.position,
    }));
    const prices = new Map(ordered.map((p) => [String(p.id), p.price]));
    const playerClubs = new Map(
      ordered.filter((p) => p.clubId !== null).map((p) => [String(p.id), String(p.clubId)]),
    );
    const validation = validateSquad(scoringPicks, prices, playerClubs, BUDGET);
    if (!validation.valid) {
      showFeedback({
        kind: "error",
        key: "errors.squad_invalid",
        extra: describeValidation(validation.errors as ValidationErrorLike[]),
      });
      return;
    }

    startTransition(async () => {
      const result = await savePicksAction(roundId, picks);
      if (result.ok) {
        const purchasePrices: Record<number, number> = {};
        for (const pick of result.data.picks) {
          purchasePrices[pick.playerId] = pick.purchasePrice;
        }
        dispatch({
          type: "SAVED",
          purchasePrices,
          feedback: { kind: "success", key: "builder.savedSuccess" },
        });
        router.refresh();
      } else {
        showFeedback(feedbackFromFailure(result.code, result.validation));
      }
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const spentPercent = Math.min(100, (spent / BUDGET) * 100);
  const showSave = !state.locked && (state.dirty || !state.hasSavedPicks);
  const usedClubs = [...clubCounts.entries()].sort((a, b) => b[1] - a[1]);

  const feedbackStyles: Record<Feedback["kind"], string> = {
    success: "border-bo-green/50 bg-bo-green/15 text-emerald-100",
    error: "border-bo-red/50 bg-bo-red/15 text-red-100",
    info: "border-bo-yellow/50 bg-bo-yellow/10 text-yellow-100",
  };

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8">
      {/* Header */}
      <header className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {squadName}
            </h1>
            <p className="mt-0.5 text-sm text-emerald-100/60">{roundName}</p>
          </div>
          <LockCountdown lockAt={state.locked ? null : lockAt} onExpire={onExpire} />
        </div>

        {/* Budget bar */}
        <div className="rounded-2xl border border-white/10 bg-pitch-900/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold text-white">{t("builder.budget")}</span>
            <span className="text-emerald-100/70">
              {t("builder.budgetSpent", { amount: spent.toFixed(1), total: BUDGET })}
            </span>
            <span
              data-testid="budget-remaining"
              className={`font-bold ${remaining < 0 ? "text-bo-red" : "text-bo-yellow"}`}
            >
              {t("builder.budgetRemaining", { amount: remaining.toFixed(1) })}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${
                spentPercent >= 100 ? "bg-bo-red" : spentPercent >= 90 ? "bg-bo-yellow" : "bg-bo-green"
              }`}
              style={{ width: `${spentPercent}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-100/70">
            <span className="font-semibold text-white" data-testid="players-count">
              {t("builder.playersCount", { count: totalPlayers })}
            </span>
            {POSITIONS.map((position) => (
              <span key={position}>
                {t(`positionsShort.${position}`)}{" "}
                <span
                  className={
                    composition[position] === SQUAD_COMPOSITION[position]
                      ? "font-bold text-bo-green"
                      : "font-bold text-white"
                  }
                >
                  {composition[position]}/{SQUAD_COMPOSITION[position]}
                </span>
              </span>
            ))}
          </div>
          {usedClubs.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-emerald-100/50">
                {t("builder.clubCounters")}:
              </span>
              {usedClubs.map(([id, count]) => (
                <span
                  key={id}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    count >= 3
                      ? "bg-bo-red/20 text-red-200"
                      : "bg-white/5 text-emerald-100/70"
                  }`}
                >
                  {clubLabel(id)} {count}/3
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Status banners */}
        {state.locked ? (
          <div
            data-testid="locked-notice"
            className="rounded-2xl border border-bo-red/40 bg-bo-red/10 p-4"
          >
            <p className="font-bold text-red-100">{t("lock.lockedTitle")}</p>
            <p className="mt-1 text-sm text-red-100/80">{t("lock.lockedDescription")}</p>
          </div>
        ) : null}

        {!state.locked && state.hasSavedPicks && !state.dirty && !transferOut ? (
          <p className="text-xs text-emerald-100/50">{t("transfers.hint")}</p>
        ) : null}

        {transferOut ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bo-yellow/40 bg-bo-yellow/10 p-3 text-sm text-yellow-100">
            <span>
              {t("transfers.choosing", {
                name: transferOut.name,
                position: t(`positions.${transferOut.position}`),
              })}
            </span>
            <button
              type="button"
              onClick={() => dispatch({ type: "CANCEL_TRANSFER" })}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20"
            >
              {t("transfers.cancel")}
            </button>
          </div>
        ) : null}

        {swapPlayer ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bo-yellow/40 bg-bo-yellow/10 p-3 text-sm text-yellow-100">
            <span>{t("swap.hint", { name: swapPlayer.name })}</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "CANCEL_SWAP" })}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20"
            >
              {t("swap.cancel")}
            </button>
          </div>
        ) : null}

        {state.feedback ? (
          <div
            role="alert"
            data-testid="feedback"
            data-kind={state.feedback.kind}
            className={`flex items-start justify-between gap-3 rounded-2xl border p-3 text-sm ${feedbackStyles[state.feedback.kind]}`}
          >
            <div>
              <p className="font-semibold">
                {t(state.feedback.key, state.feedback.values)}
              </p>
              {state.feedback.extra && state.feedback.extra.length > 0 ? (
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs opacity-90">
                  {state.feedback.extra.map((message, index) => (
                    <li key={`${message.key}-${index}`}>{t(message.key, message.values)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={t("menu.cancel")}
              onClick={() => dispatch({ type: "CLEAR_FEEDBACK" })}
              className="shrink-0 text-lg leading-none opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ) : null}
      </header>

      {/* Pitch + picker */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <Pitch
          starters={state.starters}
          bench={state.bench}
          captainId={state.captainId}
          viceId={state.viceId}
          priceOf={priceOf}
          clubsById={clubsById}
          locked={state.locked}
          showPlaceholders={totalPlayers < SQUAD_SIZE}
          swapId={state.swapId}
          swapTargets={swapTargets}
          onCardTap={handleCardTap}
          onEmptySlotTap={handleEmptySlotTap}
        />

        {!state.locked ? (
          <Picker
            players={players}
            clubs={clubs}
            clubCounts={clubCounts}
            inSquadIds={inSquadIds}
            forcedPosition={transferOut?.position ?? null}
            isSelectable={(player) =>
              state.transferOutId !== null ? true : canAddPlayer(state, player).ok
            }
            onSelect={handlePickerSelect}
            busy={pending}
            tab={pickerTab}
            onTabChange={setPickerTab}
          />
        ) : null}
      </div>

      {/* Save bar */}
      {showSave ? (
        <div className="sticky bottom-20 z-30 mt-4 flex flex-col items-center gap-2 md:bottom-4">
          {state.dirty && state.hasSavedPicks ? (
            <p className="text-xs text-yellow-200/80">{t("builder.unsavedChanges")}</p>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            data-testid="save-squad"
            className="w-full max-w-sm rounded-full bg-bo-green px-8 py-3 text-sm font-bold text-white shadow-xl shadow-black/50 ring-1 ring-white/20 transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? t("builder.saving")
              : state.hasSavedPicks
                ? t("builder.saveChanges")
                : t("builder.save")}
          </button>
        </div>
      ) : null}

      {/* Player action menu (bottom sheet) */}
      {menuPlayer && !state.locked ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label={t("menu.cancel")}
            onClick={() => dispatch({ type: "CLOSE_MENU" })}
            className="absolute inset-0 bg-black/60"
          />
          <div className="relative w-full max-w-sm rounded-t-3xl border border-white/10 bg-pitch-900 p-4 pb-6 shadow-2xl sm:rounded-3xl sm:pb-4">
            <p className="mb-3 px-2 text-sm font-bold text-white">
              {t("menu.title", { name: menuPlayer.name })}
            </p>
            <div className="flex flex-col gap-1">
              {state.starters.some((p) => p.id === menuPlayer.id) ? (
                <>
                  <MenuButton
                    testId="menu-captain"
                    label={t("menu.makeCaptain")}
                    onClick={() => dispatch({ type: "SET_CAPTAIN", id: menuPlayer.id })}
                  />
                  <MenuButton
                    testId="menu-vice"
                    label={t("menu.makeVice")}
                    onClick={() => dispatch({ type: "SET_VICE", id: menuPlayer.id })}
                  />
                </>
              ) : null}
              {state.bench.some((b) => canSwap(state, menuPlayer.id, b.id)) ||
              state.starters.some((s) => canSwap(state, s.id, menuPlayer.id)) ? (
                <MenuButton
                  testId="menu-swap"
                  label={
                    state.starters.some((p) => p.id === menuPlayer.id)
                      ? t("menu.swap")
                      : t("menu.swapToStarters")
                  }
                  onClick={() => dispatch({ type: "START_SWAP", id: menuPlayer.id })}
                />
              ) : null}
              {state.hasSavedPicks ? (
                <MenuButton
                  testId="menu-transfer"
                  label={t("menu.transfer")}
                  onClick={() => dispatch({ type: "START_TRANSFER", id: menuPlayer.id })}
                />
              ) : (
                <MenuButton
                  testId="menu-remove"
                  label={t("menu.remove")}
                  destructive
                  onClick={() => dispatch({ type: "REMOVE_PLAYER", id: menuPlayer.id })}
                />
              )}
              <MenuButton
                testId="menu-cancel"
                label={t("menu.cancel")}
                muted
                onClick={() => dispatch({ type: "CLOSE_MENU" })}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MenuButton({
  label,
  onClick,
  testId,
  destructive,
  muted,
}: {
  label: string;
  onClick: () => void;
  testId: string;
  destructive?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition hover:bg-white/10 ${
        destructive ? "text-red-300" : muted ? "text-emerald-100/60" : "text-white"
      }`}
    >
      {label}
    </button>
  );
}
