"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { createLeagueAction, joinLeagueAction } from "@/app/liga/actions";
import type { LeagueInfo } from "./types";

/** "league.notFound" -> "league_notFound" (message keys can't contain dots). */
function errorKey(code: string): string {
  return code.replaceAll(".", "_");
}

function ErrorNotice({ code }: { code: string }) {
  const t = useTranslations("leagues.errors");
  const key = errorKey(code);
  return (
    <p role="alert" className="mt-2 text-sm font-semibold text-bo-red">
      {t.has(key) ? t(key) : t("generic")}
    </p>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/15 bg-pitch-950/60 px-4 py-2.5 text-white placeholder:text-emerald-100/40 focus:border-bo-yellow focus:outline-none";
const buttonClass =
  "rounded-full bg-bo-yellow px-5 py-2.5 text-sm font-black tracking-wide text-pitch-950 uppercase transition hover:brightness-110 disabled:opacity-50";

export function CreateLeagueForm() {
  const t = useTranslations("leagues.create");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<LeagueInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createLeagueAction(name);
      if (result.ok) {
        setCreated(result.league);
        setName("");
      } else {
        setError(result.code);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-pitch-900/70 p-5">
      <h2 className="text-lg font-extrabold text-white">{t("title")}</h2>
      {created ? (
        <div data-testid="league-created" className="mt-3">
          <p className="text-sm text-emerald-100/80">
            {t("success", { name: created.name })}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <code
              data-testid="invite-code"
              className="rounded-xl border border-bo-yellow/40 bg-bo-yellow/10 px-4 py-2 text-lg font-black tracking-[0.2em] text-bo-yellow"
            >
              {created.inviteCode}
            </code>
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                void navigator.clipboard?.writeText(created.inviteCode);
                setCopied(true);
              }}
            >
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor="league-name">
            {t("nameLabel")}
          </label>
          <input
            id="league-name"
            className={inputClass}
            placeholder={t("namePlaceholder")}
            value={name}
            minLength={3}
            maxLength={40}
            required
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className={buttonClass} disabled={pending || name.trim().length < 3}>
            {pending ? t("submitting") : t("submit")}
          </button>
        </form>
      )}
      {error ? <ErrorNotice code={error} /> : null}
    </section>
  );
}

export function JoinLeagueForm() {
  const t = useTranslations("leagues.join");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await joinLeagueAction(code);
      if (result.ok) {
        setJoinedName(result.league.name);
        setCode("");
      } else {
        setError(result.code);
      }
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-pitch-900/70 p-5">
      <h2 className="text-lg font-extrabold text-white">{t("title")}</h2>
      {joinedName ? (
        <p data-testid="league-joined" className="mt-3 text-sm font-semibold text-bo-green">
          {t("success", { name: joinedName })}
        </p>
      ) : null}
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="league-code">
          {t("codeLabel")}
        </label>
        <input
          id="league-code"
          className={`${inputClass} font-mono tracking-[0.2em] uppercase`}
          placeholder={t("codePlaceholder")}
          value={code}
          minLength={8}
          maxLength={8}
          required
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <button type="submit" className={buttonClass} disabled={pending || code.trim().length !== 8}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      {error ? <ErrorNotice code={error} /> : null}
    </section>
  );
}
