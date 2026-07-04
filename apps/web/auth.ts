import NextAuth from "next-auth";
import Facebook from "next-auth/providers/facebook";
import Google from "next-auth/providers/google";

// TODO: No database adapter yet — sessions are pure JWT. The API layer
// (apps/api) will reconcile OAuth identities into persistent users later;
// once that lands, sync/lookup the internal user id here (e.g. in the jwt
// callback) instead of relying on the provider `sub`.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, Facebook],
  session: { strategy: "jwt" },
  trustHost: true, // Railway sits behind a proxy; host header is trusted there.
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      // On initial sign-in, persist the provider account id as the token sub.
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      // Expose the stable user id (JWT sub) to the app alongside
      // name / email / image, which Auth.js maps by default.
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
