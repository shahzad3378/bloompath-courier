import { QRCodeSVG } from "qrcode.react";
import { Code39Barcode } from "@/components/code39-barcode";

export function ShipmentCodes({
  trackingNumber,
  compact = false,
}: {
  trackingNumber: string;
  compact?: boolean;
}) {
  const qrSize = compact ? 78 : 104;

  return (
    <div className={`grid items-center ${compact ? "grid-cols-[minmax(0,1fr)_90px] gap-3" : "grid-cols-[minmax(0,1fr)_120px] gap-5"}`}>
      <div className="min-w-0">
        <Code39Barcode value={trackingNumber} height={compact ? 44 : 56} />
        <p className={`mt-1 text-center font-mono font-black ${compact ? "text-[12px] tracking-[0.13em]" : "text-sm tracking-[0.16em]"}`}>
          {trackingNumber}
        </p>
      </div>
      <div className="flex flex-col items-center border-l border-black/20 pl-3">
        <QRCodeSVG
          value={trackingNumber}
          size={qrSize}
          level="M"
          marginSize={4}
          title={`QR code for AWB ${trackingNumber}`}
          className="max-w-full"
        />
        <p className="mt-1 text-[8px] font-black uppercase tracking-wide">Scan AWB</p>
      </div>
    </div>
  );
}
