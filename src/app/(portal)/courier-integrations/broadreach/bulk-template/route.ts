import { requireProfile } from "@/lib/auth";
import { broadReachBulkHeaders } from "@/lib/broadreach-bulk";

export async function GET() {
  await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  const example = ["REPLACE_WITH_FASTDROP_AWB", "CAD", "Shirt", "1", "12.50", "", "", "", "", "", ""];
  return new Response([broadReachBulkHeaders.join(","), example.join(",")].join("\r\n"), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": 'attachment; filename="broadreach-bulk-template.csv"',
  } });
}
