import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const plans = [
  {
    key: "FREE_TRIAL" as const,
    name: "Free Trial",
    description: "Try the full product free for 14 days.",
    priceCents: 0,
    trialDays: 14,
    maxSeats: 3,
    maxWorkspaces: 1,
    usageLimits: { apiCallsPerMonth: 500, reportsPerMonth: 5 },
    features: ["core_dashboard"],
    sortOrder: 0,
  },
  {
    key: "STARTER" as const,
    name: "Starter",
    description: "For small teams getting started with market intelligence.",
    priceCents: 2900,
    trialDays: 0,
    maxSeats: 5,
    maxWorkspaces: 1,
    usageLimits: { apiCallsPerMonth: 5_000, reportsPerMonth: 25 },
    features: ["core_dashboard", "email_alerts"],
    sortOrder: 1,
  },
  {
    key: "PROFESSIONAL" as const,
    name: "Professional",
    description: "AI-powered insights and priority support for growing teams.",
    priceCents: 9900,
    trialDays: 0,
    maxSeats: 20,
    maxWorkspaces: 3,
    usageLimits: { apiCallsPerMonth: 25_000, reportsPerMonth: 100 },
    features: ["core_dashboard", "email_alerts", "ai_insights", "priority_support"],
    sortOrder: 2,
  },
  {
    key: "BUSINESS" as const,
    name: "Business",
    description: "SSO, custom roles, and audit export for scaling organizations.",
    priceCents: 29_900,
    trialDays: 0,
    maxSeats: 100,
    maxWorkspaces: 10,
    usageLimits: { apiCallsPerMonth: 150_000, reportsPerMonth: 500 },
    features: [
      "core_dashboard",
      "email_alerts",
      "ai_insights",
      "priority_support",
      "sso",
      "custom_roles",
      "audit_log_export",
    ],
    sortOrder: 3,
  },
  {
    key: "ENTERPRISE" as const,
    name: "Enterprise",
    description: "Custom pricing, unlimited scale, and dedicated support. Contact sales.",
    priceCents: 0,
    trialDays: 0,
    maxSeats: null,
    maxWorkspaces: null,
    usageLimits: { apiCallsPerMonth: -1, reportsPerMonth: -1 },
    features: [
      "core_dashboard",
      "email_alerts",
      "ai_insights",
      "priority_support",
      "sso",
      "custom_roles",
      "audit_log_export",
      "dedicated_support",
      "sla",
      "custom_integrations",
    ],
    sortOrder: 4,
  },
];

const roles = [
  {
    key: "OWNER",
    name: "Owner",
    description: "Full control over the workspace, billing, and members.",
    permissions: ["workspace:*", "billing:*", "members:*"],
  },
  {
    key: "ADMIN",
    name: "Admin",
    description: "Can manage members and workspace settings, not billing.",
    permissions: ["workspace:read", "workspace:update", "members:*"],
  },
  {
    key: "MEMBER",
    name: "Member",
    description: "Standard workspace member.",
    permissions: ["workspace:read"],
  },
  {
    key: "VIEWER",
    name: "Viewer",
    description: "Read-only access to the workspace.",
    permissions: ["workspace:read"],
  },
];

async function main() {
  for (const role of roles) {
    const { key, ...data } = role;
    await prisma.role.upsert({
      where: { key },
      create: { key, isSystem: true, ...data },
      update: data,
    });
    console.log(`Seeded role: ${role.name}`);
  }

  for (const plan of plans) {
    const { key, ...data } = plan;
    await prisma.plan.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    console.log(`Seeded plan: ${plan.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
