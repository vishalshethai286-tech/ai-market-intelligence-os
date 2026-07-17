import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { getTenderOpportunitiesExportRows, TENDER_OPPORTUNITY_EXPORT_COLUMNS } from "@/lib/export/service";
import { toCsv } from "@/lib/export/csv";
import { guardExport, UsageLimitExceededError, RateLimitExceededError } from "@/lib/export/guard";

export async function GET() {
  const active = await getActiveWorkspace();
  if (!active) {
    return NextResponse.json({ error: "No active workspace." }, { status: 401 });
  }

  try {
    await guardExport(active.workspace.id);
  } catch (error) {
    if (error instanceof UsageLimitExceededError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof RateLimitExceededError) return NextResponse.json({ error: error.message }, { status: 429 });
    throw error;
  }

  const rows = await getTenderOpportunitiesExportRows(active.workspace.id);
  return new NextResponse(toCsv(rows, TENDER_OPPORTUNITY_EXPORT_COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="live-tenders.csv"',
    },
  });
}
