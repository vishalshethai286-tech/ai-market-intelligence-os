import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProductServiceCard } from "./product-service-card";
import type { ProductService } from "@/models";

const approveProductServiceAction = vi.fn();
const rejectProductServiceAction = vi.fn();
const deleteProductServiceAction = vi.fn();
const updateProductServiceAction = vi.fn();

vi.mock("@/lib/actions/product-discovery", () => ({
  approveProductServiceAction: (...args: unknown[]) => approveProductServiceAction(...args),
  rejectProductServiceAction: (...args: unknown[]) => rejectProductServiceAction(...args),
  deleteProductServiceAction: (...args: unknown[]) => deleteProductServiceAction(...args),
  updateProductServiceAction: (...args: unknown[]) => updateProductServiceAction(...args),
}));

const baseRecord: ProductService = {
  id: "ps_1",
  workspaceId: "ws_1",
  websiteAnalysisId: null,
  name: "Centrifugal Pump",
  type: "PRODUCT",
  category: "Pumps",
  subcategory: null,
  description: "A pump.",
  applications: [],
  targetIndustries: [],
  buyerTypes: [],
  keywords: [],
  synonyms: [],
  relatedProductsServices: [],
  projectKeywords: [],
  tenderKeywords: [],
  vendorRegistrationKeywords: [],
  sourceUrls: ["https://acme.com/products"],
  confidenceScore: 0.8,
  lastVerifiedAt: null,
  aiRawExtraction: null,
  status: "PENDING_REVIEW",
  approvedAt: null,
  approvedByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  approveProductServiceAction.mockReset().mockResolvedValue(undefined);
  rejectProductServiceAction.mockReset().mockResolvedValue(undefined);
  deleteProductServiceAction.mockReset().mockResolvedValue(undefined);
  updateProductServiceAction.mockReset().mockResolvedValue(undefined);
});

describe("ProductServiceCard", () => {
  it("renders the record's name, confidence, and source URL", () => {
    render(<ProductServiceCard record={baseRecord} canEdit={true} />);
    expect(screen.getByText("Centrifugal Pump")).toBeInTheDocument();
    expect(screen.getByText("80% confidence")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://acme.com/products" })).toHaveAttribute(
      "href",
      "https://acme.com/products",
    );
  });

  it("shows a 'Needs review' badge for PENDING_REVIEW", () => {
    render(<ProductServiceCard record={baseRecord} canEdit={true} />);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("hides edit/approve/reject/delete controls when canEdit is false", () => {
    render(<ProductServiceCard record={baseRecord} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("disables the Approve button once already APPROVED", () => {
    render(<ProductServiceCard record={{ ...baseRecord, status: "APPROVED" }} canEdit={true} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("calls approveProductServiceAction with the record id when Approve is clicked", async () => {
    const user = userEvent.setup();
    render(<ProductServiceCard record={baseRecord} canEdit={true} />);
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(approveProductServiceAction).toHaveBeenCalledWith("ps_1");
  });

  it("calls rejectProductServiceAction with the record id when Reject is clicked", async () => {
    const user = userEvent.setup();
    render(<ProductServiceCard record={baseRecord} canEdit={true} />);
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(rejectProductServiceAction).toHaveBeenCalledWith("ps_1");
  });
});
