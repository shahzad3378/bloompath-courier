import Link from "next/link";
import { Download, FileText } from "lucide-react";
import type { FinanceExportDataset } from "@/lib/finance-exports";

export function FinanceExportButtons({
  dataset, params = {},
}: {
  dataset: FinanceExportDataset; params?: Record<string, string | undefined>;
}) {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/finance/export/${dataset}/pdf?${query}`}
        className="bp-button-secondary"
      >
        <FileText className="size-4" />
        Download PDF
      </Link>

      <Link
        href={`/finance/export/${dataset}/xlsx?${query}`}
        className="bp-button-secondary"
      >
        <Download className="size-4" />
        Download Excel
      </Link>
    </div>
  );
}
