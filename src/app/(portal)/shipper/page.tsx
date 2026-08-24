import Link from "next/link";
import {
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Clock3,
  FileText,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  ScanLine,
  Truck,
  Warehouse,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { resolveOrganizationCurrency } from "@/lib/organization-finance";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Shipper Portal",
};

type ViewKey =
  | "all"
  | "pickup"
  | "picked_up"
  | "delivery"
  | "delivered"
  | "return"
  | "rtos"
  | "cancelled";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusClasses(status: string) {
  if (status === "delivered") {
    return "bg-[#e8f7ef] text-[#13734b]";
  }

  if (status === "returned_to_shipper") {
    return "bg-[#edf3ff] text-[#46639b]";
  }

  if (status === "return_initiated") {
    return "bg-[#fff3df] text-[#a66516]";
  }

  if (status === "cancelled") {
    return "bg-[#fff0f0] text-[#b74646]";
  }

  if (status === "out_for_delivery") {
    return "bg-[#e8f0fb] text-[#376eb1]";
  }

  return "bg-[#f1f5f3] text-[#68766f]";
}

export default async function ShipperPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
  }>;
}) {
  const profile = await requireProfile(["shipper"]);
  const params = await searchParams;

  const requestedView = params.view ?? "all";

  const view: ViewKey = [
    "all",
    "pickup",
    "picked_up",
    "delivery",
    "delivered",
    "return",
    "rtos",
    "cancelled",
  ].includes(requestedView)
    ? (requestedView as ViewKey)
    : "all";

  const supabase = await createClient();

  const [
    { data: shipmentData },
    { data: invoices },
    currency,
  ] = await Promise.all([
    supabase
      .from("shipments")
      .select(`
        id,
        tracking_number,
        reference_number,
        consignee_name,
        consignee_city,
        cod_amount,
        currency,
        payment_type,
        service_type,
        status,
        booked_at,
        delivered_at,
        delivery_attempt_count
      `)
      .eq("shipper_id", profile.id)
      .is("deleted_at", null)
      .order("booked_at", {
        ascending: false,
      }),

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
    resolveOrganizationCurrency(supabase, profile.organization_id!),
  ]);

  const latestProofByShipment = new Map<
    number,
    { kind: "POA" | "POD"; attemptNumber: number }
  >();
  const shipmentIds = (shipmentData ?? []).map((row) => Number(row.id));

  if (shipmentIds.length > 0) {
    const { data: proofAttempts } = await supabase
      .from("delivery_attempts")
      .select("shipment_id, attempt_number, outcome, proof_path, created_at")
      .in("shipment_id", shipmentIds)
      .order("created_at", { ascending: false });

    for (const attempt of proofAttempts ?? []) {
      const shipmentId = Number(attempt.shipment_id);
      if (
        attempt.proof_path &&
        !latestProofByShipment.has(shipmentId)
      ) {
        latestProofByShipment.set(shipmentId, {
          kind: attempt.outcome === "delivered" ? "POD" : "POA",
          attemptNumber: Number(attempt.attempt_number),
        });
      }
    }
  }

  const shipments = (shipmentData ?? []).map((row) => ({
    ...row,
    latestProof: latestProofByShipment.get(Number(row.id)) ?? null,
  }));
  const invoiceRows = invoices ?? [];

  const toBePickedUp = shipments.filter((row) =>
    ["booked", "ready_for_pickup"].includes(row.status),
  );

  const pickedUp = shipments.filter(
    (row) => row.status === "picked_up",
  );

  const toBeDelivered = shipments.filter((row) =>
    [
      "at_warehouse",
      "out_for_delivery",
      "undelivered",
    ].includes(row.status),
  );

  const delivered = shipments.filter(
    (row) => row.status === "delivered",
  );

  const toBeReturned = shipments.filter(
    (row) => row.status === "return_initiated",
  );

  const returnedToSeller = shipments.filter(
    (row) => row.status === "returned_to_shipper",
  );

  const cancelled = shipments.filter(
    (row) => row.status === "cancelled",
  );

  const cards = [
    {
      key: "all",
      label: "All Shipments",
      value: shipments.length,
      icon: Boxes,
      href: "/shipper?view=all#shipments",
      description: "All booked AWBs",
    },
    {
      key: "pickup",
      label: "To Be Picked Up",
      value: toBePickedUp.length,
      icon: Clock3,
      href: "/shipper?view=pickup#shipments",
      description: "Waiting for courier pickup",
    },
    {
      key: "picked_up",
      label: "Picked Up",
      value: pickedUp.length,
      icon: PackageCheck,
      href: "/shipper?view=picked_up#shipments",
      description: "Collected from you",
    },
    {
      key: "delivery",
      label: "To Be Delivered",
      value: toBeDelivered.length,
      icon: Truck,
      href: "/shipper?view=delivery#shipments",
      description: "In courier operations",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: delivered.length,
      icon: CheckCircle2,
      href: "/shipper?view=delivered#shipments",
      description: "Successfully delivered",
    },
    {
      key: "return",
      label: "To Be Returned",
      value: toBeReturned.length,
      icon: RotateCcw,
      href: "/shipper?view=return#shipments",
      description: "Waiting for seller return",
    },
    {
      key: "rtos",
      label: "RTOS",
      value: returnedToSeller.length,
      icon: Warehouse,
      href: "/shipper?view=rtos#shipments",
      description: "Returned to seller",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: cancelled.length,
      icon: CircleX,
      href: "/shipper?view=cancelled#shipments",
      description: "Cancelled AWBs",
    },
  ] as const;

  const filteredShipments =
    view === "pickup"
      ? toBePickedUp
      : view === "picked_up"
        ? pickedUp
        : view === "delivery"
          ? toBeDelivered
          : view === "delivered"
            ? delivered
            : view === "return"
              ? toBeReturned
              : view === "rtos"
                ? returnedToSeller
                : view === "cancelled"
                  ? cancelled
                  : shipments;

  const selectedCard =
    cards.find((card) => card.key === view) ?? cards[0];

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

          <p className="mt-2 max-w-2xl text-sm text-[#74827b]">
            Book shipments, monitor every delivery stage,
            manage returns and access your courier invoices.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/shipments"
            className="bp-button-secondary"
          >
            <ScanLine className="size-4" />
            My Shipments
          </Link>

          <Link
            href="/shipments/new"
            className="bp-button-primary"
          >
            <PackagePlus className="size-4" />
            New Shipment
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const active = view === card.key;

          return (
            <Link
              key={card.key}
              href={card.href}
              className={`group relative overflow-hidden rounded-2xl border bg-white p-5 transition ${
                active
                  ? "border-[#8cc8aa] shadow-[0_8px_30px_rgba(19,115,75,0.10)]"
                  : "border-[#e0e8e4] hover:-translate-y-0.5 hover:border-[#b8d8c8] hover:shadow-md"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid size-11 place-items-center rounded-xl ${
                    active
                      ? "bg-[#13734b] text-white"
                      : "bg-[#edf8f2] text-[#13734b]"
                  }`}
                >
                  <Icon className="size-5" />
                </span>

                <ChevronRight
                  className={`size-4 transition ${
                    active
                      ? "text-[#13734b]"
                      : "text-[#b0bbb5] group-hover:translate-x-0.5 group-hover:text-[#13734b]"
                  }`}
                />
              </div>

              <p className="mt-5 text-3xl font-black tracking-[-0.04em] text-[#26372f]">
                {card.value}
              </p>

              <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#53645c]">
                {card.label}
              </p>

              <p className="mt-1.5 text-[11px] text-[#8a9690]">
                {card.description}
              </p>
            </Link>
          );
        })}
      </section>

      <section
        id="shipments"
        className="bp-panel mt-6 overflow-hidden scroll-mt-6"
      >
        <div className="bp-panel-header flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-[#188459]">
              Shipment Activity
            </p>

            <h2 className="mt-1 font-black text-[#26372f]">
              {selectedCard.label}
            </h2>

            <p className="mt-1 text-xs text-[#87938d]">
              {filteredShipments.length} AWB
              {filteredShipments.length === 1 ? "" : "s"} in this category.
            </p>
          </div>

          <Link
            href="/shipments"
            className="text-xs font-bold text-[#13734b] hover:underline"
          >
            Open shipment center
          </Link>
        </div>

        {filteredShipments.length === 0 ? (
          <div className="grid min-h-52 place-items-center p-8 text-center">
            <div>
              <PackageCheck className="mx-auto size-9 text-[#a7b3ad]" />

              <p className="mt-4 text-sm font-bold text-[#53645c]">
                No shipments in this category
              </p>

              <p className="mt-1 text-xs text-[#87938d]">
                Shipment activity will appear here automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1140px] text-left text-sm">
              <thead className="bg-[#fafcfb] text-[10px] uppercase tracking-wide text-[#87938d]">
                <tr>
                  <th className="px-5 py-3">AWB</th>
                  <th className="px-5 py-3">Booked</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Consignee</th>
                  <th className="px-5 py-3">City</th>
                  <th className="px-5 py-3">COD</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Proof</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf1ef]">
                {filteredShipments
                  .slice(0, 50)
                  .map((shipment) => (
                    <tr
                      key={shipment.id}
                      className="bp-table-row"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/shipments/${shipment.id}`}
                          className="font-mono text-xs font-black text-[#13734b]"
                        >
                          {shipment.tracking_number}
                        </Link>
                      </td>

                      <td className="px-5 py-4 text-xs text-[#68766f]">
                        {formatDubaiDate(shipment.booked_at)}
                      </td>

                      <td className="px-5 py-4 text-xs text-[#68766f]">
                        {shipment.reference_number || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-bold text-[#34453c]">
                          {shipment.consignee_name}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-[#68766f]">
                        {shipment.consignee_city || "—"}
                      </td>

                      <td className="px-5 py-4 font-bold">
                        {formatMoney(
                          Number(shipment.cod_amount || 0),
                          shipment.currency || currency,
                        )}
                      </td>

                      <td className="px-5 py-4 text-center font-bold">
                        {shipment.delivery_attempt_count}
                      </td>

                      <td className="px-5 py-4">
                        {shipment.latestProof ? (
                          <Link
                            href={`/shipments/${shipment.id}#delivery-proofs`}
                            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${
                              shipment.latestProof.kind === "POD"
                                ? "bg-[#e4f3ea] text-[#166b47]"
                                : "bg-[#fff0d8] text-[#976019]"
                            }`}
                          >
                            View {shipment.latestProof.kind} · #{shipment.latestProof.attemptNumber}
                          </Link>
                        ) : (
                          <span className="text-xs text-[#87938d]">—</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusClasses(
                            shipment.status,
                          )}`}
                        >
                          {statusLabel(shipment.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredShipments.length > 50 ? (
          <div className="border-t border-[#edf1ef] bg-[#fafcfb] px-5 py-3 text-center text-xs text-[#87938d]">
            Showing latest 50 of {filteredShipments.length} AWBs.
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="bp-panel overflow-hidden">
          <div className="bp-panel-header flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#26372f]">
                Invoices
              </h2>

              <p className="mt-1 text-xs text-[#87938d]">
                Courier invoices issued to your account.
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
                    {formatMoney(
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
                {formatMoney(
                  openInvoiceValue,
                  invoiceRows[0]?.currency || currency,
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
