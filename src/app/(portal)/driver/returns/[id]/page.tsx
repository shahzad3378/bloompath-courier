import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Box,
  MapPin,
  Navigation,
  Phone,
  RotateCcw,
} from "lucide-react";
import { SellerReturnPodForm } from "@/components/return-forms";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Seller Return",
};

type ReturnStop = {
  id: number;
  completed_at: string | null;
  shipments: {
    tracking_number: string;
    sender_name: string;
    sender_phone: string;
    sender_address: string;
    sender_city: string;
    pieces: number;
    weight_kg: number;
    parcel_description: string;
    last_undelivered_reason: string | null;
  };
  return_runs: {
    run_number: string;
    route_name: string;
    driver_id: string;
    status: string;
  };
};

export default async function DriverReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile(["driver"]);
  const { id } = await params;

  if (!/^\d+$/.test(id)) notFound();

  const supabase = await createClient();

  const { data } = await supabase
    .from("return_run_items")
    .select("*, shipments(*), return_runs!inner(*)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const item = data as unknown as ReturnStop;

  if (
    item.return_runs.driver_id !== profile.id ||
    item.return_runs.status !== "handed_over" ||
    item.completed_at
  ) {
    notFound();
  }

  const shipment = item.shipments;

  const address = [
    shipment.sender_address,
    shipment.sender_city,
    "United Arab Emirates",
  ]
    .filter(Boolean)
    .join(", ");

  const mapHref =
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <div className="mx-auto max-w-[1050px]">
      <Link
        href="/driver"
        className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#587068]"
      >
        <ArrowLeft className="size-4" />
        Back to my route
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl bg-[#5c3421] p-5 text-white sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#ffd1aa]">
            Seller return stop
          </p>
          <h1 className="mt-2 font-mono text-2xl font-black">
            {shipment.tracking_number}
          </h1>
          <p className="mt-2 text-sm text-white/65">
            {item.return_runs.run_number} · {item.return_runs.route_name}
          </p>
        </div>

        <span className="grid size-12 place-items-center rounded-xl bg-white/10">
          <RotateCcw className="size-6" />
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[#fff0e5] text-[#b76223]">
                <MapPin className="size-5" />
              </span>
              <div>
                <p className="text-xs text-[#819088]">
                  Return to seller
                </p>
                <h2 className="text-lg font-bold text-[#26372f]">
                  {shipment.sender_name}
                </h2>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-[#56655e]">
              <a
                href={`tel:${shipment.sender_phone}`}
                className="flex items-center gap-3 rounded-xl bg-[#f6f9f7] px-4 py-3 font-bold text-[#13734b]"
              >
                <Phone className="size-5" />
                {shipment.sender_phone}
              </a>

              <p className="px-4">
                {shipment.sender_address}
                <br />
                {shipment.sender_city}
              </p>

              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#376eb1] px-4 font-bold text-white"
              >
                <Navigation className="size-4" />
                Open navigation
              </a>
            </div>
          </section>

          <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5">
            <div className="flex items-center gap-3">
              <Box className="size-5 text-[#188459]" />
              <h2 className="font-bold text-[#26372f]">
                Parcel
              </h2>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#87938d]">Pieces</dt>
                <dd className="font-bold">{shipment.pieces}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-[#87938d]">Weight</dt>
                <dd className="font-bold">
                  {shipment.weight_kg} kg
                </dd>
              </div>

              <div>
                <dt className="text-[#87938d]">Contents</dt>
                <dd className="mt-1 font-semibold">
                  {shipment.parcel_description}
                </dd>
              </div>

              <div>
                <dt className="text-[#87938d]">Return reason</dt>
                <dd className="mt-1 font-semibold capitalize">
                  {shipment.last_undelivered_reason
                    ?.replaceAll("_", " ") ?? "Return to seller"}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <SellerReturnPodForm itemId={item.id} />
      </div>
    </div>
  );
}
