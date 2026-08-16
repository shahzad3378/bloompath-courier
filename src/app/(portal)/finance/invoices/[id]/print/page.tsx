import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatDubaiDate } from "@/lib/shipments";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Print Invoice",
};

function relation<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function money(
  value: unknown,
  currency = "AED",
) {
  return `${currency} ${Number(value || 0).toFixed(2)}`;
}

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile([
    "super_admin",
    "operations_admin",
    "finance_staff",
    "shipper",
  ]);

  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    notFound();
  }

  const supabase = await createClient();

  let invoiceQuery = supabase
    .from("invoices")
    .select(`
      id,
      organization_id,
      shipper_id,
      invoice_number,
      status,
      currency,
      subtotal,
      tax_rate,
      tax_amount,
      total_amount,
      cod_collected,
      total_delivery_charges,
      total_return_charges,
      net_settlement_payable,
      invoice_date,
      due_date,
      paid_at,
      payment_reference,
      settlement:settlements!invoices_settlement_id_fkey(
        settlement_number,
        period_from,
        period_to
      ),
      shipper:profiles!invoices_shipper_id_fkey(
        full_name,
        email,
        phone
      )
    `)
    .eq("id", Number(id))
    .eq("organization_id", profile.organization_id);

  if (profile.role === "shipper") {
    invoiceQuery = invoiceQuery.eq(
      "shipper_id",
      profile.id,
    );
  }

  const { data: invoice } =
    await invoiceQuery.maybeSingle();

  if (!invoice) {
    notFound();
  }

  const settlement = relation(invoice.settlement);
  const shipper = relation(invoice.shipper);

  const [{ data: items }, { data: settings }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select(`
          id,
          tracking_number,
          delivered_at,
          consignee_name,
          consignee_city,
          cod_amount,
          delivery_charge,
          return_charge,
          total_charges,
          net_payable
        `)
        .eq("invoice_id", invoice.id)
        .order("id"),

      supabase
        .from("organization_settings")
        .select(`
          legal_name,
          display_name,
          contact_email,
          contact_phone,
          website,
          address,
          city,
          trn,
          logo_url
        `)
        .eq(
          "organization_id",
          profile.organization_id,
        )
        .maybeSingle(),
    ]);

  const rows = items ?? [];
  const currency = invoice.currency || "AED";

  const companyName =
    settings?.display_name ||
    settings?.legal_name ||
    "Courier Company";

  return (
    <main className="min-h-screen bg-[#eef2f0] px-4 py-6 text-black print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[1100px] justify-end gap-2 print:hidden">
        <Link
          href={
            profile.role === "shipper"
              ? `/shipper/invoices/${invoice.id}`
              : `/finance/invoices/${invoice.id}`
          }
          className="rounded-lg border border-[#cfd9d4] bg-white px-4 py-2 text-sm font-bold"
        >
          Back
        </Link>

        <button
          onClick={undefined}
          className="hidden"
        >
          Print
        </button>

        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('load',function(){setTimeout(function(){window.print()},250)})",
          }}
        />
      </div>

      <article className="mx-auto max-w-[1100px] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-6">
          <div className="flex items-start gap-4">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt={companyName}
                className="h-16 w-16 object-contain"
              />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-lg bg-black text-sm font-black text-white">
                LOGO
              </div>
            )}

            <div>
              <h1 className="text-2xl font-black">
                {companyName}
              </h1>

              {settings?.legal_name ? (
                <p className="mt-1 text-sm">
                  {settings.legal_name}
                </p>
              ) : null}

              <div className="mt-2 space-y-1 text-xs text-black/65">
                {settings?.address || settings?.city ? (
                  <p>
                    {[settings.address, settings.city]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : null}

                {settings?.contact_phone ? (
                  <p>{settings.contact_phone}</p>
                ) : null}

                {settings?.contact_email ? (
                  <p>{settings.contact_email}</p>
                ) : null}

                {settings?.trn ? (
                  <p>TRN: {settings.trn}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/50">
              Tax Invoice
            </p>

            <p className="mt-2 font-mono text-xl font-black">
              {invoice.invoice_number}
            </p>

            <div className="mt-3 space-y-1 text-xs">
              <p>
                Invoice Date:{" "}
                <strong>{invoice.invoice_date}</strong>
              </p>

              <p>
                Due Date:{" "}
                <strong>{invoice.due_date || "—"}</strong>
              </p>

              <p>
                Status:{" "}
                <strong className="uppercase">
                  {invoice.status.replaceAll("_", " ")}
                </strong>
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6 border-b border-black pb-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/50">
              Bill To
            </p>

            <p className="mt-2 text-base font-black">
              {shipper?.full_name || "Shipper"}
            </p>

            <p className="mt-1 text-sm">
              {shipper?.email || "—"}
            </p>

            {shipper?.phone ? (
              <p className="mt-1 text-sm">
                {shipper.phone}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/50">
              Settlement
            </p>

            <p className="mt-2 font-mono text-sm font-black">
              {settlement?.settlement_number || "—"}
            </p>

            <p className="mt-2 text-xs">
              Period:{" "}
              {settlement?.period_from
                ? formatDubaiDate(
                    settlement.period_from,
                  )
                : "—"}{" "}
              →{" "}
              {settlement?.period_to
                ? formatDubaiDate(
                    settlement.period_to,
                  )
                : "—"}
            </p>
          </div>
        </section>

        <section className="mt-6">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="py-2 pr-2">AWB</th>
                <th className="py-2 pr-2">Delivered</th>
                <th className="py-2 pr-2">Consignee</th>
                <th className="py-2 pr-2">City</th>
                <th className="py-2 pr-2 text-right">COD</th>
                <th className="py-2 pr-2 text-right">Delivery</th>
                <th className="py-2 pr-2 text-right">Return</th>
                <th className="py-2 pr-2 text-right">Charges</th>
                <th className="py-2 text-right">Net</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-black/20"
                >
                  <td className="py-2 pr-2 font-mono font-bold">
                    {row.tracking_number}
                  </td>

                  <td className="py-2 pr-2">
                    {row.delivered_at
                      ? formatDubaiDate(
                          row.delivered_at,
                        )
                      : "—"}
                  </td>

                  <td className="py-2 pr-2">
                    {row.consignee_name || "—"}
                  </td>

                  <td className="py-2 pr-2">
                    {row.consignee_city || "—"}
                  </td>

                  <td className="py-2 pr-2 text-right">
                    {money(row.cod_amount, currency)}
                  </td>

                  <td className="py-2 pr-2 text-right">
                    {money(
                      row.delivery_charge,
                      currency,
                    )}
                  </td>

                  <td className="py-2 pr-2 text-right">
                    {money(
                      row.return_charge,
                      currency,
                    )}
                  </td>

                  <td className="py-2 pr-2 text-right">
                    {money(
                      row.total_charges,
                      currency,
                    )}
                  </td>

                  <td className="py-2 text-right font-bold">
                    {money(
                      row.net_payable,
                      currency,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8 ml-auto max-w-[420px]">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-6">
              <span>COD Collected</span>
              <strong>
                {money(
                  invoice.cod_collected,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-6">
              <span>Delivery Charges</span>
              <strong>
                {money(
                  invoice.total_delivery_charges,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-6">
              <span>Return Charges</span>
              <strong>
                {money(
                  invoice.total_return_charges,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-6">
              <span>Service Subtotal</span>
              <strong>
                {money(
                  invoice.subtotal,
                  currency,
                )}
              </strong>
            </div>

            <div className="flex justify-between gap-6">
              <span>
                VAT (
                {Number(
                  invoice.tax_rate || 0,
                ).toFixed(2)}
                %)
              </span>

              <strong>
                {money(
                  invoice.tax_amount,
                  currency,
                )}
              </strong>
            </div>

            <div className="mt-3 border-t-2 border-black pt-3">
              <div className="flex justify-between gap-6 text-base">
                <span className="font-black">
                  Invoice Total
                </span>

                <strong>
                  {money(
                    invoice.total_amount,
                    currency,
                  )}
                </strong>
              </div>
            </div>

            <div className="border-t border-black/30 pt-3">
              <div className="flex justify-between gap-6 text-base">
                <span className="font-black">
                  Net COD Payable
                </span>

                <strong>
                  {money(
                    invoice.net_settlement_payable,
                    currency,
                  )}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {invoice.status === "paid" ? (
          <section className="mt-8 border-2 border-black p-4">
            <p className="text-lg font-black">
              PAID
            </p>

            <p className="mt-1 text-xs">
              {invoice.paid_at
                ? `Paid ${formatDubaiDate(
                    invoice.paid_at,
                  )}`
                : "Payment completed."}
            </p>

            {invoice.payment_reference ? (
              <p className="mt-1 text-xs font-bold">
                Payment Reference:{" "}
                {invoice.payment_reference}
              </p>
            ) : null}
          </section>
        ) : null}

        <footer className="mt-10 border-t border-black/30 pt-4 text-[10px] leading-4 text-black/55">
          This invoice contains the AWB-level shipment and courier
          charge details included in settlement{" "}
          {settlement?.settlement_number || "—"}.
        </footer>
      </article>
    </main>
  );
}
