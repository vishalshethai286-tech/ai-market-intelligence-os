import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { Role, Plan } from "../src/models";

// See the comment in src/lib/mongodb.ts — some networks can't resolve a
// `mongodb+srv://` URI's DNS SRV record via Node's default resolver.
if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// usageLimits keys are read by src/lib/billing/usage.ts's getPlanLimits() — keep the two in sync.
// -1 means "unlimited" (Growth's global country coverage, every Enterprise limit).
const plans = [
  {
    key: "FREE_TRIAL" as const,
    name: "Free Trial",
    description: "Try the full product free for 14 days.",
    priceCents: 0,
    trialDays: 14,
    maxSeats: 1,
    maxWorkspaces: 1,
    usageLimits: {
      maxWebsites: 1,
      maxProductsServices: 3,
      maxCustomers: 50,
      maxProjects: 10,
      maxTenderBuyers: 10,
      maxLiveTenders: 10,
      maxVendorRegistrations: 10,
      maxContacts: 50,
      discoveryCreditsPerMonth: 100,
      maxTargetCountries: 5,
      exportsPerMonth: 10,
      dailyAutomation: false,
      manualDiscoveryOnly: true,
      duplicateReview: false,
      reports: false,
      csvExports: true,
      contactDiscovery: false,
      advancedReports: false,
    },
    features: ["core_dashboard"],
    sortOrder: 0,
  },
  {
    key: "STARTER" as const,
    name: "Starter",
    description: "For small teams getting started with market intelligence.",
    priceCents: 2900,
    trialDays: 0,
    maxSeats: 1,
    maxWorkspaces: 1,
    usageLimits: {
      maxWebsites: 1,
      maxProductsServices: 10,
      maxCustomers: 500,
      maxProjects: 50,
      maxTenderBuyers: 50,
      maxLiveTenders: 50,
      maxVendorRegistrations: 50,
      maxContacts: 500,
      discoveryCreditsPerMonth: 1_000,
      maxTargetCountries: 5,
      dailyAutomation: false,
      manualDiscoveryOnly: true,
      duplicateReview: false,
      reports: false,
      csvExports: true,
      contactDiscovery: false,
      advancedReports: false,
    },
    features: ["core_dashboard", "email_alerts"],
    sortOrder: 1,
  },
  {
    key: "PROFESSIONAL" as const,
    name: "Professional",
    description: "AI-powered insights and priority support for growing teams.",
    priceCents: 9900,
    trialDays: 0,
    maxSeats: 5,
    maxWorkspaces: 1,
    usageLimits: {
      maxProductsServices: 50,
      maxCustomers: 3_000,
      maxProjects: 250,
      maxTenderBuyers: 250,
      maxLiveTenders: 250,
      maxVendorRegistrations: 250,
      maxContacts: 3_000,
      discoveryCreditsPerMonth: 5_000,
      maxTargetCountries: 25,
      dailyAutomation: true,
      manualDiscoveryOnly: false,
      duplicateReview: true,
      reports: true,
      csvExports: true,
      contactDiscovery: true,
      advancedReports: false,
    },
    features: ["core_dashboard", "email_alerts", "ai_insights", "priority_support"],
    sortOrder: 2,
  },
  {
    key: "BUSINESS" as const,
    name: "Business",
    description: "Advanced reporting and contact discovery for scaling organizations.",
    priceCents: 29_900,
    trialDays: 0,
    maxSeats: 20,
    maxWorkspaces: 1,
    usageLimits: {
      maxWebsites: 3,
      maxProductsServices: 200,
      maxCustomers: 15_000,
      maxProjects: 1_000,
      maxTenderBuyers: 1_000,
      maxLiveTenders: 1_000,
      maxVendorRegistrations: 1_000,
      maxContacts: 15_000,
      discoveryCreditsPerMonth: 25_000,
      maxTargetCountries: 100,
      dailyAutomation: true,
      manualDiscoveryOnly: false,
      duplicateReview: true,
      reports: true,
      csvExports: true,
      contactDiscovery: true,
      advancedReports: true,
      // Reserved — no priority queue exists yet; every plan runs the same queue today.
      priorityQueuePlaceholder: true,
    },
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
    description: "Global discovery coverage and larger record limits for scaling sales teams.",
    priceCents: 59_900,
    trialDays: 0,
    maxSeats: 50,
    maxWorkspaces: 1,
    usageLimits: {
      maxWebsites: 10,
      maxProductsServices: 500,
      maxCustomers: 50_000,
      maxProjects: 3_000,
      maxTenderBuyers: 3_000,
      maxLiveTenders: 3_000,
      maxVendorRegistrations: 3_000,
      maxContacts: 50_000,
      discoveryCreditsPerMonth: 100_000,
      maxTargetCountries: -1,
      dailyAutomation: true,
      manualDiscoveryOnly: false,
      duplicateReview: true,
      reports: true,
      csvExports: true,
      contactDiscovery: true,
      advancedReports: true,
      advancedDashboard: true,
      // Reserved — no public API exists yet.
      apiAccessPlaceholder: true,
    },
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
    usageLimits: {
      maxWebsites: -1,
      maxProductsServices: -1,
      maxCustomers: -1,
      maxProjects: -1,
      maxTenderBuyers: -1,
      maxLiveTenders: -1,
      maxVendorRegistrations: -1,
      maxContacts: -1,
      discoveryCreditsPerMonth: -1,
      maxTargetCountries: -1,
      dailyAutomation: true,
      manualDiscoveryOnly: false,
      duplicateReview: true,
      reports: true,
      csvExports: true,
      contactDiscovery: true,
      advancedReports: true,
      advancedDashboard: true,
      customSupport: true,
      customSources: true,
      // Reserved — every workspace shares the same worker pool today.
      dedicatedWorkerPlaceholder: true,
    },
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
