import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user?.passwordHash || user.deletedAt) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;

        const membership = await prisma.workspaceMember.findFirst({
          where: { userId: user.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { workspace: true, role: true },
        });

        if (membership) {
          token.workspaceId = membership.workspace.id;
          token.workspaceSlug = membership.workspace.slug;
          token.workspaceName = membership.workspace.name;
          token.role = membership.role.key;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.workspaceId = token.workspaceId;
      session.user.workspaceSlug = token.workspaceSlug;
      session.user.workspaceName = token.workspaceName;
      session.user.role = token.role;
      return session;
    },
  },
});
