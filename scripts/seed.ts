import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { Role, Plan } from "../src/models";

// See the comment in src/lib/mongodb.ts — some networks can't resolve a
// `mongodb+srv://` URI's DNS SRV record via Node's default resolver.
if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

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
    key: "GROWTH" as const,
    name: "Growth",
    description: "Expanded discovery coverage and reporting for scaling sales teams.",
    priceCents: 59_900,
    trialDays: 0,
    maxSeats: 250,
    maxWorkspaces: 25,
    usageLimits: { apiCallsPerMonth: 400_000, reportsPerMonth: 1_500 },
    features: [
      "core_dashboard",
      "email_alerts",
      "ai_insights",
      "priority_support",
      "sso",
      "custom_roles",
      "audit_log_export",
      "advanced_discovery_coverage",
    ],
    sortOrder: 4,
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
    sortOrder: 5,
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
    key: "MANAGER",
    name: "Manager",
    description: "Can edit company profile, product catalog, and Business Brain facts.",
    permissions: ["workspace:read", "content:*"],
  },
  {
    key: "USER",
    name: "User",
    description: "Standard workspace member working with sales/market data.",
    permissions: ["workspace:read", "content:*"],
  },
  {
    key: "VIEWER",
    name: "Viewer",
    description: "Read-only access to the workspace.",
    permissions: ["workspace:read"],
  },
  {
    key: "PLATFORM_ADMIN",
    name: "Platform Admin",
    description: "Internal platform team override — full access across every workspace action.",
    permissions: ["*"],
  },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);

  for (const role of roles) {
    const { key, ...data } = role;
    await Role.findOneAndUpdate({ key }, { key, isSystem: true, ...data }, { upsert: true });
    console.log(`Seeded role: ${role.name}`);
  }

  for (const plan of plans) {
    const { key, ...data } = plan;
    await Plan.findOneAndUpdate({ key }, { key, ...data }, { upsert: true });
    console.log(`Seeded plan: ${plan.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
