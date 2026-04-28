import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      const allowedDomain = process.env.ALLOWED_DOMAIN ?? "las.ch";
      const email = profile?.email ?? "";
      return email.endsWith(`@${allowedDomain}`);
    },
    async jwt({ token, profile }) {
      if (profile?.email) token.email = profile.email;
      if (profile?.name) token.name = profile.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      if (session.user && typeof token.name === "string") {
        session.user.name = token.name;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
