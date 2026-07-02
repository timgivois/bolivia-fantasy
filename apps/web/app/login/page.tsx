import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth, signIn } from "@/auth";
import { BallIcon } from "@/components/logo";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#1877F2" aria-hidden="true">
      <path d="M24 12a12 12 0 1 0-13.88 11.85v-8.38H7.08V12h3.04V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.79v8.38A12 12 0 0 0 24 12Z" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, t, { callbackUrl }] = await Promise.all([
    auth(),
    getTranslations("login"),
    searchParams,
  ]);

  // Only allow same-site redirect targets.
  const redirectTo = callbackUrl?.startsWith("/") ? callbackUrl : "/equipo";

  if (session) {
    redirect(redirectTo);
  }

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-gradient-to-b from-pitch-900 via-pitch-950 to-pitch-950 px-6 py-16">
      {/* Pitch line backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-emerald-400/10"
      />

      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-pitch-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur sm:p-10">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bo-yellow/15 text-bo-yellow ring-1 ring-bo-yellow/40">
            <BallIcon className="h-8 w-8" />
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{t("title")}</h1>
          <p className="text-sm text-emerald-100/70">{t("subtitle")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              <GoogleIcon />
              {t("google")}
            </button>
          </form>

          <form
            action={async () => {
              "use server";
              await signIn("facebook", { redirectTo });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              <FacebookIcon />
              {t("facebook")}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-emerald-100/50">{t("legal")}</p>
      </section>
    </main>
  );
}
