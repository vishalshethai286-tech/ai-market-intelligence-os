import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { getContactsExportRows, CONTACT_EXPORT_COLUMNS } from "@/lib/export/service";
import { toCsv } from "@/lib/export/csv";

export async function GET() {
  const active = await getActiveWorkspace();
  if (!active) {
    return NextResponse.json({ error: "No active workspace." }, { status: 401 });
  }

  const rows = await getContactsExportRows(active.workspace.id);
  return new NextResponse(toCsv(rows, CONTACT_EXPORT_COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
    },
  });
}
