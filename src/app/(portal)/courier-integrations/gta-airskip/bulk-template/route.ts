import { requireProfile } from "@/lib/auth";
import { gtaBulkHeaders } from "@/lib/gta-bulk";
export async function GET() {
  await requireProfile(["super_admin", "operations_admin", "dispatcher"]);
  return new Response(gtaBulkHeaders.join(",") + "\r\n", { headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": 'attachment; filename="gta-bulk-template.csv"', "Cache-Control": "no-store" } });
}
