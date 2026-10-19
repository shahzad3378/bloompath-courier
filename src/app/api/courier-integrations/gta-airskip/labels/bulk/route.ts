import { PDFDocument } from "pdf-lib";
import { getCurrentProfile } from "@/lib/auth";
import { getGtaBookingConfig, requestGtaReprint } from "@/lib/gta-airskip-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const pageWidth = 4 * 72;
const pageHeight = 6 * 72;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active" || !["super_admin", "operations_admin", "dispatcher"].includes(profile.role) || !profile.organization_id) {
    return new Response("Unauthorized", { status: 403 });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch { return new Response("Invalid request body.", { status: 400 }); }
  const ids = payload && typeof payload === "object" && Array.isArray((payload as { ids?: unknown }).ids)
    ? (payload as { ids: unknown[] }).ids
    : null;
  if (!ids || ids.length < 1 || ids.length > 50 || ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
    return new Response("Select between 1 and 50 valid GTA bookings.", { status: 400 });
  }
  const uniqueIds = [...new Set(ids as string[])];
  const admin = createAdminClient();
  const { data, error } = await admin.from("gta_airskip_bookings")
    .select("id,partner_tracking_number,status,is_test,base_url,label_base64,label_format")
    .eq("organization_id", profile.organization_id)
    .in("id", uniqueIds)
    .in("status", ["generated", "ready", "needs_review"]);
  if (error || !data || data.length !== uniqueIds.length) return new Response("One or more selected GTA labels are unavailable.", { status: 404 });

  const ordered = uniqueIds.map(id => data.find(booking => booking.id === id)!);
  if (ordered.some(booking => !booking.partner_tracking_number)) return new Response("A selected booking has no confirmed GTA AWB.", { status: 400 });

  const output = await PDFDocument.create();
  try {
    for (const booking of ordered) {
      let bytes: Buffer | null = null;
      if (booking.label_base64 && booking.label_format === "png") {
        const saved = Buffer.from(booking.label_base64, "base64");
        if (saved.subarray(0, 8).equals(pngSignature)) bytes = saved;
      }
      if (!bytes) {
        const config = getGtaBookingConfig(profile.organization_id, booking.base_url);
        if (!config) throw new Error("GTA label access is unavailable for one or more selected bookings.");
        bytes = await requestGtaReprint(booking.partner_tracking_number!, "PDF", config);
      }

      if (bytes.subarray(0, 8).equals(pngSignature)) {
        const image = await output.embedPng(bytes);
        const scale = Math.min(pageWidth / image.width, pageHeight / image.height);
        const width = image.width * scale, height = image.height * scale;
        const page = output.addPage([pageWidth, pageHeight]);
        page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
      } else if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
        const source = await PDFDocument.load(bytes);
        const pages = await output.embedPdf(source);
        for (const label of pages) {
          const scale = Math.min(pageWidth / label.width, pageHeight / label.height);
          const width = label.width * scale, height = label.height * scale;
          const page = output.addPage([pageWidth, pageHeight]);
          page.drawPage(label, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
        }
      } else {
        throw new Error("A selected GTA label is not available in printable PNG or PDF format.");
      }
    }
  } catch (issue) {
    const message = issue instanceof Error ? issue.message : "Selected GTA labels could not be prepared.";
    return new Response(message, { status: 502 });
  }

  const bytes = await output.save();
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="gta-airskip-4x6-labels.pdf"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
