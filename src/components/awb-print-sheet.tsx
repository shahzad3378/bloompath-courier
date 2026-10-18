import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Code39Barcode } from "@/components/code39-barcode";
import { formatDubaiDate, formatMoney, serviceLabels, type Shipment } from "@/lib/shipments";

type Branding = { name: string; legalName?: string | null; logoUrl: string | null; location: string; currency?: string };

function addressLines(
  address: string,
  address2: string | null | undefined,
  city: string,
  state: string | null | undefined,
  postal: string | null | undefined,
  country: string | null | undefined,
) {
  return [address, address2, city, state, postal, country].filter((line): line is string => Boolean(line));
}

function truncateLabelText(value: string | null | undefined, wordLimit: number) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > wordLimit ? `${words.slice(0, wordLimit).join(" ")}...` : words.join(" ");
}

function AddressBlock({
  eyebrow,
  name,
  phone,
  lines,
  secondaryPhone,
  landmark,
}: {
  eyebrow: string;
  name: string;
  phone: string;
  lines: string[];
  secondaryPhone?: string | null;
  landmark?: string | null;
}) {
  return (
    <section className="bp-awb-address">
      <p className="bp-awb-eyebrow">{eyebrow}</p>
      <p className="bp-awb-address-name">{name}</p>
      <p className="bp-awb-address-phone">{[phone, secondaryPhone].filter(Boolean).join(" · ")}</p>
      <p className="bp-awb-address-lines">{lines.join(", ")}</p>
      {landmark ? <p className="bp-awb-address-note">Landmark: {landmark}</p> : null}
    </section>
  );
}

export function AwbPrintSheet({
  shipment,
  format,
  branding,
  pieceNumber = 1,
  pieceCount = shipment.pieces,
}: {
  shipment: Shipment;
  format: "4x6" | "a4";
  branding?: Branding;
  pieceNumber?: number;
  pieceCount?: number;
}) {
  const brandName = branding?.name || "BloomPath Courier";
  const brandLegalName = branding?.legalName?.trim();
  const brandSubline = [
    brandLegalName && brandLegalName.toLowerCase() !== brandName.trim().toLowerCase() ? brandLegalName : null,
    branding?.location,
  ].filter(Boolean).join(" · ");
  const currency = shipment.currency || branding?.currency || "AED";
  const brandInitials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "BP";
  const destination = shipment.consignee_postal_code || shipment.consignee_area || shipment.consignee_country_code || "DESTINATION";
  const shortDestination = shipment.service_zone_name || shipment.consignee_postal_code?.split(/[\s-]+/)[0] || shipment.consignee_area || shipment.consignee_country_code || "—";
  const dimensions = [shipment.length_cm, shipment.width_cm, shipment.height_cm].every((value) => value != null)
    ? `${shipment.length_cm} × ${shipment.width_cm} × ${shipment.height_cm} cm`
    : null;
  const hasCod = shipment.payment_type === "cod";

  return (
    <article className={`bp-awb-sheet bp-awb-${format}`}>
      <header className="bp-awb-header">
        <div className="bp-awb-brand">
          {branding?.logoUrl ? (
            <span className="bp-awb-logo"><Image src={branding.logoUrl} alt={`${brandName} logo`} width={140} height={140} unoptimized /></span>
          ) : (
            <span className="bp-awb-logo bp-awb-logo-initials">{brandInitials}</span>
          )}
          <div className="bp-awb-brand-copy">
            <p className="bp-awb-brand-name">{brandName}</p>
            {brandSubline ? <p className="bp-awb-brand-location">{brandSubline}</p> : null}
          </div>
        </div>
        <div className="bp-awb-piece">
          <span>Pieces</span>
          <strong>{pieceNumber}<i> of </i>{pieceCount}</strong>
        </div>
      </header>

      <div className="bp-awb-address-grid">
        <AddressBlock
          eyebrow="From / Shipper"
          name={shipment.sender_name}
          phone={shipment.sender_phone}
          lines={addressLines(shipment.sender_address, shipment.sender_address_2, shipment.sender_city, shipment.sender_state_province, shipment.sender_postal_code, shipment.sender_country_code)}
        />
        <AddressBlock
          eyebrow="To / Consignee"
          name={shipment.consignee_name}
          phone={shipment.consignee_phone}
          secondaryPhone={shipment.consignee_alt_phone}
          lines={addressLines(shipment.consignee_address, shipment.consignee_address_2, shipment.consignee_city, shipment.consignee_state_province, shipment.consignee_postal_code, shipment.consignee_country_code)}
          landmark={shipment.consignee_landmark}
        />
      </div>

      <div className="bp-awb-reference-row">
        <span>Ref / Réf</span>
        <strong>{shipment.reference_number || "—"}</strong>
      </div>

      <section className="bp-awb-service-band" aria-label="Shipment service and destination">
        <div className="bp-awb-service-name"><span>Service</span><strong>{serviceLabels[shipment.service_type]}</strong></div>
        <div className="bp-awb-service-destination"><span>Zone / Destination</span><strong>{shortDestination}</strong></div>
      </section>
      <div className="bp-awb-booked"><strong>Date: {formatDubaiDate(shipment.booked_at)}</strong></div>

      <section className="bp-awb-tracking">
        <p className="bp-awb-eyebrow">Tracking Number / AWB</p>
        <div className="bp-awb-barcode"><Code39Barcode value={shipment.tracking_number} height={54} /></div>
        <p className="bp-awb-tracking-number">{shipment.tracking_number}</p>
      </section>

      <section className="bp-awb-shipment-facts">
        <p className="bp-awb-facts-primary">{dimensions ? `${dimensions}  ·  ` : ""}{shipment.weight_kg} kg</p>
        <p className="bp-awb-facts-payment">Payment · {hasCod ? `COD ${formatMoney(shipment.cod_amount, currency)}` : "Prepaid"}</p>
      </section>

      <footer className="bp-awb-footer">
        <div className="bp-awb-footer-copy">
          <p className="bp-awb-eyebrow">Contents</p>
          <p className="bp-awb-contents">{truncateLabelText(shipment.parcel_description || "Parcel", 8)}</p>
          {shipment.delivery_instructions ? <p className="bp-awb-instructions"><b>Delivery note:</b> {truncateLabelText(shipment.delivery_instructions, 10)}</p> : null}
          {shipment.service_zone_name ? <p className="bp-awb-zone">Service zone · {truncateLabelText(shipment.service_zone_name, 5)}</p> : null}
          <div className="bp-awb-footer-destination"><span>Destination</span><strong>{destination}</strong></div>
        </div>
        <div className="bp-awb-qr" aria-label={`QR code for AWB ${shipment.tracking_number}`}>
          <QRCodeSVG value={shipment.tracking_number} size={104} level="M" marginSize={3} title={`QR code for AWB ${shipment.tracking_number}`} />
        </div>
      </footer>
    </article>
  );
}
