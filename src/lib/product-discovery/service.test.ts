import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// @/lib/workspace imports @/auth (next-auth) and next/headers/next/navigation
// transitively, none of which resolve/work outside a live Next.js request —
// mocked here even though this file never calls auth()/cookies()/redirect()
// itself, purely so importing createWorkspaceWithOwner doesn't pull in the
// real next-auth module graph. Same reasoning as src/lib/workspace.test.ts.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { dbConnect } = await import("@/lib/mongodb");
const { User, Workspace } = await import("@/models");
const { readCollection } = await import("@/lib/json-store");
const { createWorkspaceWithOwner } = await import("@/lib/workspace");
const {
  approveProductService,
  createProductService,
  deleteProductService,
  ProductServiceNotFoundError,
  rejectProductService,
  updateProductService,
} = await import("./service");
type ProductServiceEditableFields = Parameters<typeof createProductService>[1];

await dbConnect();

const TEST_PREFIX = "vitest-product-approval-";

const BASE_FIELDS: ProductServiceEditableFields = {
  name: "Centrifugal Pump",
  type: "PRODUCT",
  category: "Pumps",
  subcategory: "Centrifugal",
  description: "A test pump.",
  applications: ["Water treatment"],
  targetIndustries: ["Oil & Gas"],
  buyerTypes: ["OEM"],
  keywords: ["pump"],
  synonyms: ["centrifugal pump"],
  relatedProductsServices: [],
  projectKeywords: ["pump installation"],
  tenderKeywords: ["pump supply tender"],
  vendorRegistrationKeywords: ["pump vendor registration"],
};

describe("product/service approval flow", () => {
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    const user = await User.create({ email: `${TEST_PREFIX}${Date.now()}@example.com`, name: "Product Approval" });
    userId = user.id;
    const workspace = await createWorkspaceWithOwner("Product Approval Co", userId);
    workspaceId = workspace.id;
    const otherWorkspace = await createWorkspaceWithOwner("Other Co", userId);
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await Workspace.deleteMany({ _id: { $in: [workspaceId, otherWorkspaceId] } });
    await User.deleteOne({ _id: userId });
  });

  it("createProductService adds a manual entry as PENDING_REVIEW with full confidence and no source URLs", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    expect(created.status).toBe("PENDING_REVIEW");
    expect(created.confidenceScore).toBe(1);
    expect(created.sourceUrls).toEqual([]);
    expect(created.type).toBe("PRODUCT");
    expect(created.projectKeywords).toEqual(["pump installation"]);
  });

  it("approveProductService transitions PENDING_REVIEW -> APPROVED and stamps approvedAt/approvedByUserId", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    const approved = await approveProductService(workspaceId, created.id, userId);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.approvedByUserId).toBe(userId);
  });

  it("rejectProductService transitions to REJECTED and clears approval fields", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    await approveProductService(workspaceId, created.id, userId);
    const rejected = await rejectProductService(workspaceId, created.id);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.approvedAt).toBeNull();
    expect(rejected.approvedByUserId).toBeNull();
  });

  it("updateProductService applies edits and bumps lastVerifiedAt", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    const updated = await updateProductService(workspaceId, created.id, {
      ...BASE_FIELDS,
      name: "Renamed Pump",
      type: "SERVICE",
    });
    expect(updated.name).toBe("Renamed Pump");
    expect(updated.type).toBe("SERVICE");
    expect(updated.lastVerifiedAt).not.toBeNull();
  });

  it("deleteProductService removes the row", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    await deleteProductService(workspaceId, created.id);
    const rows = await readCollection<{ id: string }>("product-services");
    expect(rows.find((row) => row.id === created.id)).toBeUndefined();
  });

  it("rejects approving a record that belongs to a different workspace (ownership check)", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    await expect(approveProductService(otherWorkspaceId, created.id, userId)).rejects.toThrow(
      ProductServiceNotFoundError,
    );
  });

  it("rejects updating a record that belongs to a different workspace (ownership check)", async () => {
    const created = await createProductService(workspaceId, BASE_FIELDS);
    await expect(updateProductService(otherWorkspaceId, created.id, BASE_FIELDS)).rejects.toThrow(
      ProductServiceNotFoundError,
    );
  });
});
