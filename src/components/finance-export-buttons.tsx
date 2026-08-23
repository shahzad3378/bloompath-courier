import Link from "next/link";
import { Download, FileText } from "lucide-react";
import type { FinanceExportDataset } from "@/lib/finance-exports";

export function FinanceExportButtons({
  dataset,
}: {
  dataset: FinanceExportDataset;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/finance/export/${dataset}/pdf`}
        className="bp-button-secondary"
      >
        <FileText className="size-4" />
        PDF
      </Link>

      <Link
        href={`/finance/export/${dataset}/xlsx`}
        className="bp-button-secondary"
      >
        <Download className="size-4" />
        Excel
      </Link>
    </div>
  );
}
