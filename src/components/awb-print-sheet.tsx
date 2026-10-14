import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { Code39Barcode } from "@/components/code39-barcode";
import { formatDubaiDate, formatMoney, serviceLabels, type Shipment } from "@/lib/shipments";

type Branding = { name: string; logoUrl: string | null; location: string; currency?: string };

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

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`bp-awb-metric${emphasis ? " bp-awb-metric-emphasis" : ""}`}>
      <p className="bp-awb-eyebrow">{label}</p>
      <p className="bp-awb-metric-value">{value}</p>
    </div>
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
  const currency = shipment.currency || branding?.currency || "AED";
  const brandInitials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "BP";
  const service = serviceLabels[shipment.service_type];
  const destination = shipment.consignee_postal_code || shipment.consignee_area || shipment.consignee_country_code || "DESTINATION";
  const dimensions = [shipment.length_cm, shipment.width_cm, shipment.height_cm].every((value) => value != null)
    ? `${shipment.length_cm} × ${shipment.width_cm} × ${shipment.height_cm} cm`
    : "Not recorded";
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
            {branding?.location ? <p className="bp-awb-brand-location">{branding.location}</p> : null}
          </div>
        </div>
        <div className="bp-awb-piece">
          <span>Pieces</span>
          <strong>{pieceNumber}<i> / </i>{pieceCount}</strong>
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
        <div><span>Reference</span><strong>{shipment.reference_number || "—"}</strong></div>
        <div><span>Booked</span><strong>{formatDubaiDate(shipment.booked_at)}</strong></div>
      </div>

      <section className="bp-awb-service-band" aria-label="Shipment service and payment">
        <div className="bp-awb-service-name"><span>Service</span><strong>{service}</strong></div>
        <div className="bp-awb-payment"><span>{hasCod ? "Collect on delivery" : "Payment"}</span><strong>{hasCod ? formatMoney(shipment.cod_amount, currency) : "PREPAID"}</strong></div>
      </section>

      <section className="bp-awb-tracking">
        <p className="bp-awb-eyebrow">Tracking Number / AWB</p>
        <Code39Barcode value={shipment.tracking_number} height={49} />
        <p className="bp-awb-tracking-number">{shipment.tracking_number}</p>
      </section>

      <section className="bp-awb-details">
        <Metric label="Weight" value={`${shipment.weight_kg} kg`} emphasis />
        <Metric label="Pieces" value={`${pieceCount}`} />
        <Metric label="Dimensions" value={dimensions} />
      </section>

      <footer className="bp-awb-footer">
        <div className="bp-awb-footer-copy">
          <p className="bp-awb-eyebrow">Contents</p>
          <p className="bp-awb-contents">{shipment.parcel_description || "Parcel"}</p>
          {shipment.delivery_instructions ? <p className="bp-awb-instructions"><b>Delivery note:</b> {shipment.delivery_instructions}</p> : null}
          {shipment.service_zone_name ? <p className="bp-awb-zone">Delivery zone · {shipment.service_zone_name}</p> : null}
        </div>
        <div className="bp-awb-destination">
          <p className="bp-awb-eyebrow">Destination</p>
          <strong>{destination}</strong>
        </div>
        <div className="bp-awb-qr" aria-label={`QR code for AWB ${shipment.tracking_number}`}>
          <QRCodeSVG value={shipment.tracking_number} size={72} level="M" marginSize={3} title={`QR code for AWB ${shipment.tracking_number}`} />
          <span>Scan AWB</span>
        </div>
      </footer>
    </article>
  );
}
