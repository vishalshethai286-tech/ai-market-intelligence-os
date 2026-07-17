import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { dbConnect } from "@/lib/mongodb";
import { WorkspaceInvite, Workspace, Role } from "@/models";
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AcceptInviteButton } from "./accept-invite-button";

export const metadata: Metadata = { title: "Accept invite" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await dbConnect();
  const [session, inviteRow] = await Promise.all([auth(), WorkspaceInvite.findOne({ token })]);

  const [workspace, role] = inviteRow
    ? await Promise.all([Workspace.findById(inviteRow.workspaceId), Role.findById(inviteRow.roleId)])
    : [null, null];
  const invite = inviteRow && workspace && role ? { ...inviteRow.toObject(), workspace, role } : null;

  const isValid = invite && invite.status === "PENDING" && invite.expiresAt > new Date();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 font-semibold tracking-tight">
        {siteConfig.name}
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Workspace invite</CardTitle>
          {isValid ? (
            <CardDescription>
              You&apos;ve been invited to join <strong className="text-foreground">{invite.workspace.name}</strong>{" "}
              as {invite.role.name}.
            </CardDescription>
          ) : (
            <CardDescription>This invite is invalid or has expired. Ask for a new one.</CardDescription>
          )}
        </CardHeader>
        {isValid && (
          <CardContent>
            {session?.user ? (
              <AcceptInviteButton token={token} />
            ) : (
              <p className="text-sm text-black/60 dark:text-white/60">
                <Link href="/login" className="font-medium text-current underline underline-offset-4">
                  Log in
                </Link>{" "}
                with <strong className="text-foreground">{invite.email}</strong>, then come back to this link to
                accept.
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
