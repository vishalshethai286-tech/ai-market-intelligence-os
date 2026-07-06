import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      workspaceId: string;
      workspaceSlug: string;
      workspaceName: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    role: string;
  }
}
