#!/usr/bin/env node
// Guards the multi-tenancy convention: every data model must belong to a
// Workspace. Add a model to EXEMPT_MODELS only if it's genuinely global
// (an account, a role/plan catalog) rather than tenant data.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// *SourceHistoryEntry schemas are embedded subdocuments (TargetCustomer/ProjectOpportunity/
// TenderBuyer/TenderOpportunity/VendorRegistration.sourceHistory), not their own top-level
// collections — they inherit workspace scoping from the parent document.
const EXEMPT_MODELS = new Set([
  "User",
  "Workspace",
  "Role",
  "Plan",
  "PasswordResetToken",
  "SourceHistoryEntry",
  "ProjectSourceHistoryEntry",
  "TenderBuyerSourceHistoryEntry",
  "TenderOpportunitySourceHistoryEntry",
  "VendorRegistrationSourceHistoryEntry",
  "ContactSourceHistoryEntry",
]);

const modelsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "models");

const violations = [];

for (const file of readdirSync(modelsDir)) {
  if (!file.endsWith(".ts") || file === "index.ts" || file === "shared.ts") continue;
  const source = readFileSync(path.join(modelsDir, file), "utf8");

  // Each model is defined as `const XSchema = new Schema({ ... fields ... }`;
  // splitting on that declaration gives us one chunk per schema containing
  // its field list (up to the next schema declaration in the same file).
  const parts = source.split(/const (\w+)Schema = new Schema\(/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1] ?? "";
    if (EXEMPT_MODELS.has(name)) continue;
    if (!/\bworkspaceId\b/.test(body)) violations.push(name);
  }
}

if (violations.length > 0) {
  console.error("Workspace-scoping check failed — these models are missing a `workspaceId` field:");
  for (const name of violations) console.error(`  - ${name}`);
  console.error(
    "\nEvery data model must belong to a Workspace. Add a `workspaceId` field, " +
      "or if the model is genuinely global/account-level, add it to EXEMPT_MODELS in scripts/check-workspace-scoping.mjs.",
  );
  process.exit(1);
}

console.log("Workspace-scoping check passed — all non-exempt models have a workspaceId field.");
