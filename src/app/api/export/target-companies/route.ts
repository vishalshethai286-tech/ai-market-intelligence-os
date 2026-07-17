import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { listTargetCompanies } from "@/lib/target-companies/service";
import { toCsv } from "@/lib/export/csv";
import { guardExport, UsageLimitExceededError, RateLimitExceededError } from "@/lib/export/guard";

const CSV_COLUMNS = [
  "id",
  "companyName",
  "website",
  "country",
  "cityState",
  "industry",
  "companyDescription",
  "buyerType",
  "matchedProduct",
  "priorityGrade",
  "priorityScore",
  "confidenceScore",
  "status",
  "duplicateStatus",
  "createdAt",
];

export async function GET(request: Request) {
  const active = await getActiveWorkspace();
  if (!active) {
    return NextResponse.json({ error: "No active workspace." }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";

  if (format === "csv") {
    try {
      await guardExport(active.workspace.id);
    } catch (error) {
      if (error instanceof UsageLimitExceededError) return NextResponse.json({ error: error.message }, { status: 403 });
      if (error instanceof RateLimitExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
      throw error;
    }
  }

  const records = await listTargetCompanies(active.workspace.id);

  if (format === "csv") {
    return new NextResponse(toCsv(records, CSV_COLUMNS), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="target-companies.csv"',
      },
    });
  }

  return new NextResponse(JSON.stringify(records, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="target-companies.json"',
    },
  });
}
