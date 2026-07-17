import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { listProductServices } from "@/lib/product-discovery/service";
import { toCsv } from "@/lib/export/csv";

const CSV_COLUMNS = [
  "id",
  "name",
  "type",
  "category",
  "subcategory",
  "description",
  "applications",
  "targetIndustries",
  "buyerTypes",
  "keywords",
  "synonyms",
  "status",
  "confidenceScore",
  "sourceUrls",
  "createdAt",
];

export async function GET(request: Request) {
  const active = await getActiveWorkspace();
  if (!active) {
    return NextResponse.json({ error: "No active workspace." }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const records = await listProductServices(active.workspace.id);

  if (format === "csv") {
    return new NextResponse(toCsv(records, CSV_COLUMNS), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="products.csv"',
      },
    });
  }

  return new NextResponse(JSON.stringify(records, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="products.json"',
    },
  });
}
