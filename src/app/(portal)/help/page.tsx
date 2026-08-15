import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  BookOpen,
  CircleHelp,
  ClipboardList,
  FileSpreadsheet,
  LifeBuoy,
  PackageCheck,
  RotateCcw,
  ScanLine,
  Truck,
  Warehouse,
} from "lucide-react";

export const metadata = {
  title: "Help & Support",
};

const guides = [
  {
    title: "Create & manage shipments",
    description:
      "Book AWBs, use bulk upload, search shipments and print 4×6 or A4 labels.",
    href: "/shipments",
    icon: PackageCheck,
  },
  {
    title: "Pickup manifests",
    description:
      "Create pickup manifests, scan shipper AWBs and follow warehouse receiving.",
    href: "/pickup-manifests",
    icon: ClipboardList,
  },
  {
    title: "Warehouse operations",
    description:
      "Check physical custody, receive driver returns and manage reattempt or RTO stock.",
    href: "/warehouse",
    icon: Warehouse,
  },
  {
    title: "Dispatch & delivery",
    description:
      "Prepare delivery runs, assign drivers and monitor delivery attempts.",
    href: "/dispatch",
    icon: Truck,
  },
  {
    title: "Returns to seller",
    description:
      "Prepare RTS routes, hand shipments to drivers and capture seller POD.",
    href: "/returns",
    icon: RotateCcw,
  },
  {
    title: "COD & settlements",
    description:
      "Track driver COD custody, receive cash and manage shipper settlements.",
    href: "/finance",
    icon: BadgeDollarSign,
  },
];

const faqs = [
  {
    q: "Why is an AWB not available for dispatch?",
    a: "The shipment must be physically warehouse-ready. Driver returns must first be received back into warehouse custody before another dispatch.",
  },
  {
    q: "Why does an undelivered shipment show Aging?",
    a: "Aging starts from the latest unsuccessful delivery attempt and continues while the shipment remains in the active undelivered, reattempt or return workflow.",
  },
  {
    q: "What happens after three unsuccessful attempts?",
    a: "The shipment moves toward Return to Seller. If permitted, the shipper may authorize a fourth delivery attempt before final return.",
  },
  {
    q: "What happens if the customer refuses the shipment?",
    a: "Customer-refused shipments move directly toward the return workflow instead of continuing normal reattempts.",
  },
  {
    q: "Where can I export shipment data?",
    a: "Use the Shipments page for CSV or Excel exports and Reports for filtered operational reporting.",
  },
  {
    q: "Where is COD received from a driver?",
    a: "Open COD & Finance. Driver COD can be received against individual delivered AWBs, including partial receipts where applicable.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[1350px]">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold text-[#188459]">
            BloomPath Courier support
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">
            Help & Support
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#74827b]">
            Quick operational guidance for shipment booking, warehouse custody,
            dispatch, returns, COD and reporting.
          </p>
        </div>

        <div className="rounded-xl border border-[#d9e5df] bg-white px-5 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b8982]">
            System
          </p>
          <p className="mt-1 text-sm font-black text-[#13734b]">
            BloomPath Courier V1
          </p>
        </div>
      </div>

      <section className="mt-7 rounded-2xl border border-[#dce6e1] bg-[#10291f] p-6 text-white shadow-[0_10px_35px_rgba(24,51,39,0.08)] sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-[#62d398]">
                <LifeBuoy className="size-5" />
              </span>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#62d398]">
                  Quick help
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  Need to find an operational record?
                </h2>
              </div>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
              Start with the shipment AWB. The shipment record and timeline show
              booking, pickup, warehouse, dispatch, delivery attempts and return
              history.
            </p>
          </div>

          <Link
            href="/shipments"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2ca66e] px-5 text-sm font-bold text-white transition hover:bg-[#26935f]"
          >
            Find shipment
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-[#13734b]" />
          <div>
            <h2 className="font-bold text-[#26372f]">
              Operational guides
            </h2>
            <p className="mt-1 text-xs text-[#87938d]">
              Open the relevant workspace directly.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {guides.map((guide) => {
            const Icon = guide.icon;

            return (
              <Link
                key={guide.title}
                href={guide.href}
                className="group rounded-2xl border border-[#e0e8e4] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b7d6c6] hover:shadow-[0_10px_30px_rgba(24,51,39,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
                    <Icon className="size-5" />
                  </span>

                  <ArrowRight className="size-4 text-[#9aa7a0] transition group-hover:translate-x-1 group-hover:text-[#13734b]" />
                </div>

                <h3 className="mt-4 font-bold text-[#26372f]">
                  {guide.title}
                </h3>

                <p className="mt-2 text-xs leading-5 text-[#7b8982]">
                  {guide.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white">
          <div className="border-b border-[#e8eeeb] px-5 py-4">
            <div className="flex items-center gap-3">
              <CircleHelp className="size-5 text-[#13734b]" />
              <div>
                <h2 className="font-bold text-[#26372f]">
                  Common questions
                </h2>
                <p className="mt-1 text-xs text-[#87938d]">
                  Frequently used operational rules.
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-[#edf1ef]">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="group px-5 py-4"
              >
                <summary className="cursor-pointer list-none text-sm font-bold text-[#34453c]">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-lg font-normal text-[#87938d] group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>

                <p className="mt-3 max-w-3xl text-xs leading-5 text-[#74827b]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
            <div className="flex items-center gap-3">
              <ScanLine className="size-5 text-[#13734b]" />
              <h2 className="font-bold text-[#26372f]">
                Scanner tip
              </h2>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#74827b]">
              Keep the cursor inside the AWB scan field before scanning.
              Barcode scanners normally submit the tracking number automatically.
            </p>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-5 text-[#13734b]" />
              <h2 className="font-bold text-[#26372f]">
                Bulk upload
              </h2>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#74827b]">
              Always use the latest BloomPath Excel template. If one row fails
              validation, the complete batch is stopped to prevent partial
              shipment creation.
            </p>

            <Link
              href="/shipments/import"
              className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#13734b]"
            >
              Open bulk upload
              <ArrowRight className="size-3.5" />
            </Link>
          </section>

          <section className="rounded-2xl border border-[#d9e7e0] bg-[#f7fbf9] p-5">
            <div className="flex items-center gap-3">
              <LifeBuoy className="size-5 text-[#13734b]" />
              <h2 className="font-bold text-[#26372f]">
                Contact support
              </h2>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#74827b]">
              For a system issue, share the AWB number, affected module,
              screenshot and a short description of the problem with your
              BloomPath system administrator.
            </p>

            <p className="mt-4 rounded-xl border border-[#dce8e2] bg-white px-4 py-3 text-xs font-semibold text-[#53645b]">
              Ticketing and in-app support requests can be added in a future release.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
