import {
  createFinanceExport,
  financeExportDatasets,
  financeExportFormats,
  type FinanceExportDataset,
  type FinanceExportFormat,
} from "@/lib/finance-exports";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      dataset: string;
      format: string;
    }>;
  },
) {
  const { dataset, format } = await context.params;

  if (
    !financeExportDatasets.includes(
      dataset as FinanceExportDataset,
    ) ||
    !financeExportFormats.includes(
      format as FinanceExportFormat,
    )
  ) {
    return new Response("Unsupported finance export.", {
      status: 404,
    });
  }

  return createFinanceExport(
    dataset as FinanceExportDataset,
    format as FinanceExportFormat,
  );
}
