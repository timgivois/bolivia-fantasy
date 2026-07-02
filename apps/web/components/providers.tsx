"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Client-side providers. SessionProvider lets future client components
 * (squad builder, live scores, etc.) read the session via `useSession`.
 * Server components should keep using `auth()` from `@/auth` directly.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
