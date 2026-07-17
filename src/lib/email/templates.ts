import { siteConfig } from "@/config/site";

function wrap(bodyHtml: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <p style="font-weight:600;font-size:16px">${siteConfig.name}</p>
  ${bodyHtml}
</div>`;
}

export function passwordResetEmail(resetUrl: string) {
  return {
    subject: `Reset your ${siteConfig.name} password`,
    html: wrap(`
      <p>We received a request to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetUrl}" style="color:#000">Reset your password</a></p>
      <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    `),
    text: `Reset your ${siteConfig.name} password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
  };
}

export function workspaceInviteEmail(workspaceName: string, inviterName: string, acceptUrl: string) {
  return {
    subject: `${inviterName} invited you to join ${workspaceName} on ${siteConfig.name}`,
    html: wrap(`
      <p>${inviterName} invited you to join <strong>${workspaceName}</strong> on ${siteConfig.name}. This invite expires in 7 days.</p>
      <p><a href="${acceptUrl}" style="color:#000">Accept invite</a></p>
    `),
    text: `${inviterName} invited you to join ${workspaceName} on ${siteConfig.name}: ${acceptUrl}\n\nThis invite expires in 7 days.`,
  };
}
