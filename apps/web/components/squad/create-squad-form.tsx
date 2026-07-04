"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { createSquadAction } from "@/app/equipo/actions";

import { errorFeedbackKey } from "./errors";

/** First-visit flow: name the squad, then the builder takes over. */
export function CreateSquadForm() {
  const t = useTranslations("squad");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createSquadAction(trimmed);
      if (result.ok) {
        // The page re-renders server-side with the fresh squad -> builder.
        router.refresh();
      } else {
        setError(t(errorFeedbackKey(result.code)));
      }
    });
  };

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center px-6 py-16">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-pitch-900/80 p-8 shadow-2xl shadow-black/40 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          {t("create.title")}
        </h1>
        <p className="mt-3 text-sm text-emerald-100/70">{t("create.description")}</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-emerald-100/90">
              {t("create.nameLabel")}
            </span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("create.namePlaceholder")}
              maxLength={60}
              required
              data-testid="squad-name-input"
              className="rounded-xl border border-white/15 bg-pitch-950/80 px-4 py-3 text-white placeholder:text-emerald-100/30 focus:border-bo-yellow/60 focus:ring-2 focus:ring-bo-yellow/30 focus:outline-none"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-lg bg-bo-red/15 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            data-testid="create-squad-submit"
            className="rounded-full bg-bo-yellow px-6 py-3 text-sm font-bold text-pitch-950 transition-colors hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? t("create.submitting") : t("create.submit")}
          </button>
        </form>
      </section>
    </main>
  );
}
