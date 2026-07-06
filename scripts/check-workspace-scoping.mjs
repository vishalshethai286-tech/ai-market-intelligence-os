#!/usr/bin/env node
// Guards the multi-tenancy convention: every data model must belong to a
// Workspace. Add a model to EXEMPT_MODELS only if it's genuinely global
// (an account, a role/plan catalog) rather than tenant data.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXEMPT_MODELS = new Set(["User", "Workspace", "Role", "Plan"]);

const schemaPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "schema.prisma",
);
const schema = readFileSync(schemaPath, "utf8");

const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
const violations = [];
let match;

while ((match = modelRegex.exec(schema))) {
  const [, name, body] = match;
  if (EXEMPT_MODELS.has(name)) continue;
  if (!/\bworkspaceId\b/.test(body)) violations.push(name);
}

if (violations.length > 0) {
  console.error("Workspace-scoping check failed — these models are missing a `workspaceId` field:");
  for (const name of violations) console.error(`  - ${name}`);
  console.error(
    "\nEvery data model must belong to a Workspace. Add `workspaceId` (with a relation to Workspace), " +
      "or if the model is genuinely global/account-level, add it to EXEMPT_MODELS in scripts/check-workspace-scoping.mjs.",
  );
  process.exit(1);
}

console.log("Workspace-scoping check passed — all non-exempt models have a workspaceId field.");
