import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Stable user id (JWT `sub`, provider account id until the API reconciles users). */
      id: string;
    } & DefaultSession["user"];
  }
}
