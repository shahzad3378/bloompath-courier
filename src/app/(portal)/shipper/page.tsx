import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  FileText,
  PackagePlus,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shipper Portal" };

function money(
  value: unknown,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default async function ShipperPage() {
  const profile = await requireProfile(["shipper"]);

  const supabase = await createClient();

  const [
    { count: totalShipments },
    { count: deliveredShipments },
    { count: returnShipments },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("shipper_id", profile.id)
      .is("deleted_at", null),

    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("shipper_id", profile.id)
      .eq("status", "delivered")
      .is("deleted_at", null),

    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("shipper_id", profile.id)
      .in("status", [
        "return_initiated",
        "returned_to_shipper",
      ])
      .is("deleted_at", null),

    supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        status,
        currency,
        total_amount,
        net_settlement_payable,
        invoice_date
      `)
      .eq("shipper_id", profile.id)
      .in("status", [
        "issued",
        "sent",
        "paid",
        "overdue",
      ])
      .order("invoice_date", {
        ascending: false,
      }),
  ]);

  const invoiceRows = invoices ?? [];

  const openInvoices = invoiceRows.filter(
    (row) => row.status !== "paid",
  );

  const paidInvoices = invoiceRows.filter(
    (row) => row.status === "paid",
  );

  const latestInvoice = invoiceRows[0] ?? null;

  const openInvoiceValue = openInvoices.reduce(
    (sum, row) =>
      sum + Number(row.total_amount || 0),
    0,
  );

  return (
    <div className="bp-page">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="bp-section-label">
            Shipper Portal
          </p>

          <h1 className="bp-heading mt-1 text-3xl font-black">
            Welcome,{" "}
            {profile.full_name?.split(" ")[0] || "Shipper"}
          </h1>

          <p className="mt-2 text-sm text-[#74827b]">
            Book shipments, track deliveries, review returns
            and access your courier invoices.
          </p>
        </div>

        <Link
          href="/shipments/new"
          className="bp-button-primary"
        >
          <PackagePlus className="size-4" />
          New Shipment
        </Link>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bp-card p-5">
          <PackageCheck className="size-5 text-[#15905c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {totalShipments ?? 0}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Total Shipments
          </p>
        </div>

        <div className="bp-card p-5">
          <CheckCircle2 className="size-5 text-[#15905c]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {deliveredShipments ?? 0}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Delivered
          </p>
        </div>

        <div className="bp-card p-5">
          <RotateCcw className="size-5 text-[#b76223]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {returnShipments ?? 0}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Returns / RTO
          </p>
        </div>

        <div className="bp-card p-5">
          <FileText className="size-5 text-[#3f82df]" />

          <p className="mt-4 text-2xl font-black text-[#26372f]">
            {openInvoices.length}
          </p>

          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
            Open Invoices
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="bp-panel overflow-hidden">
          <div className="bp-panel-header flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#26372f]">
                Invoices
              </h2>

              <p className="mt-1 text-xs text-[#87938d]">
                Same invoices issued by your courier company.
              </p>
            </div>

            <Link
              href="/shipper/invoices"
              className="text-xs font-bold text-[#13734b]"
            >
              View all
            </Link>
          </div>

          {latestInvoice ? (
            <div className="p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Latest Invoice
                  </p>

                  <Link
                    href={`/shipper/invoices/${latestInvoice.id}`}
                    className="mt-1 block font-mono text-base font-black text-[#13734b]"
                  >
                    {latestInvoice.invoice_number}
                  </Link>

                  <p className="mt-1 text-xs text-[#87938d]">
                    {latestInvoice.invoice_date}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                    Invoice Total
                  </p>

                  <p className="mt-1 text-lg font-black text-[#26372f]">
                    {money(
                      latestInvoice.total_amount,
                      latestInvoice.currency,
                    )}
                  </p>

                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                      latestInvoice.status === "paid"
                        ? "bg-[#e8f7ef] text-[#13734b]"
                        : "bg-[#fff3df] text-[#a66516]"
                    }`}
                  >
                    {latestInvoice.status.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center">
              <FileText className="mx-auto size-8 text-[#a2aea8]" />
              <p className="mt-4 text-sm font-bold text-[#53645c]">
                No invoices yet
              </p>
              <p className="mt-1 text-xs text-[#87938d]">
                Issued courier invoices will appear here automatically.
              </p>
            </div>
          )}
        </div>

        <div className="bp-panel p-5">
          <h2 className="font-black text-[#26372f]">
            Invoice Summary
          </h2>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-[#fff8ec] p-4">
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-[#d58a27]" />
                <div>
                  <p className="text-xs font-bold text-[#5a4b36]">
                    Open invoices
                  </p>
                  <p className="mt-1 text-[10px] text-[#8c7c65]">
                    Awaiting payment
                  </p>
                </div>
              </div>

              <p className="font-black text-[#a66516]">
                {openInvoices.length}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-[#edf8f2] p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-[#15905c]" />
                <div>
                  <p className="text-xs font-bold text-[#30443a]">
                    Paid invoices
                  </p>
                  <p className="mt-1 text-[10px] text-[#718078]">
                    Payment completed
                  </p>
                </div>
              </div>

              <p className="font-black text-[#13734b]">
                {paidInvoices.length}
              </p>
            </div>

            <div className="border-t border-[#edf1ef] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#87938d]">
                Open Invoice Value
              </p>

              <p className="mt-2 text-xl font-black text-[#26372f]">
                {money(
                  openInvoiceValue,
                  invoiceRows[0]?.currency || "AED",
                )}
              </p>
            </div>
          </div>

          <Link
            href="/shipper/invoices"
            className="bp-button-secondary mt-5 w-full justify-center"
          >
            <FileText className="size-4" />
            View My Invoices
          </Link>
        </div>
      </section>
    </div>
  );
}
