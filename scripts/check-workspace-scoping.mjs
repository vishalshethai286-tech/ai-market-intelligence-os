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

// --- Advisory query-level scan --------------------------------------------
// The schema check above only proves the field exists; it says nothing about
// whether any given call site actually filters by it. This second pass is a
// best-effort heuristic (regex, not a type-aware AST walk) that flags
// `<TenantModel>.<query method>(...)` call sites with no `workspaceId`
// anywhere in the following few lines, so a human can double-check them.
// Deliberately non-blocking (never exits non-zero): callers like `findById`
// on an id already fetched from a workspace-scoped query, or the
// /platform-admin section's intentionally cross-workspace reads, are
// expected and not bugs — this is a prompt for review, not a lint rule.
const tenantModelNames = new Set();
for (const file of readdirSync(modelsDir)) {
  if (!file.endsWith(".ts") || file === "index.ts" || file === "shared.ts") continue;
  const source = readFileSync(path.join(modelsDir, file), "utf8");
  const parts = source.split(/const (\w+)Schema = new Schema\(/).slice(1);
  for (let i = 0; i < parts.length; i += 2) {
    const name = parts[i];
    if (!EXEMPT_MODELS.has(name)) tenantModelNames.add(name);
  }
}

const QUERY_METHODS = ["find", "findOne", "findById", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments", "aggregate", "findOneAndUpdate", "findByIdAndUpdate"];
const modelPattern = [...tenantModelNames].join("|");
const callRegex = new RegExp(`\\b(${modelPattern})\\.(${QUERY_METHODS.join("|")})\\(`);

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const SKIP_DIRS = new Set(["platform-admin", "node_modules"]);
const LOOKAHEAD_LINES = 5;

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
      files.push(full);
    }
  }
}

const sourceFiles = [];
walk(srcDir, sourceFiles);

const advisories = [];
for (const file of sourceFiles) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(callRegex);
    if (!match) continue;
    const window = lines.slice(i, i + LOOKAHEAD_LINES).join("\n");
    if (!/\bworkspaceId\b/.test(window)) {
      advisories.push(`  - ${path.relative(process.cwd(), file)}:${i + 1} — ${match[1]}.${match[2]}(...)`);
    }
  }
}

if (advisories.length > 0) {
  console.log(`\nAdvisory: ${advisories.length} query call site(s) on tenant models with no workspaceId in the surrounding ${LOOKAHEAD_LINES} lines (informational only, not a failure — review manually):`);
  for (const line of advisories) console.log(line);
} else {
  console.log("Advisory query-level scan: no unscoped tenant-model query call sites found.");
}
