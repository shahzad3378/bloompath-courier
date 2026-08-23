import "server-only";

import ExcelJS from "exceljs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { requireProfile } from "@/lib/auth";
import { normalizeCurrency } from "@/lib/currency";
import {
  getShipperDirectory,
  resolveOrganizationCurrency,
} from "@/lib/organization-finance";
import { createClient } from "@/lib/supabase/server";

export const financeExportDatasets = [
  "transactions",
  "invoices",
  "settlements",
  "cod",
] as const;

export const financeExportFormats = [
  "pdf",
  "xlsx",
] as const;

export type FinanceExportDataset =
  (typeof financeExportDatasets)[number];

export type FinanceExportFormat =
  (typeof financeExportFormats)[number];

type ExportValue = string | number | null;

type ExportRow = Record<string, ExportValue>;

type ExportColumn = {
  key: string;
  header: string;
  width: number;
  numeric?: boolean;
};

type ExportData = {
  title: string;
  fileName: string;
  currency: string;
  columns: ExportColumn[];
  rows: ExportRow[];
};

const financeRoles = [
  "super_admin",
  "operations_admin",
  "finance_staff",
] as const;

function isoDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

async function loadExportData(
  dataset: FinanceExportDataset,
): Promise<{
  data: ExportData;
  companyName: string;
}> {
  const profile = await requireProfile(financeRoles);

  if (!profile.organization_id) {
    throw new Error("Organization is required.");
  }

  const supabase = await createClient();
  const organizationId = profile.organization_id;

  const [
    currency,
    shipperDirectory,
    { data: settings },
  ] = await Promise.all([
    resolveOrganizationCurrency(
      supabase,
      organizationId,
    ),
    getShipperDirectory(supabase, organizationId),
    supabase
      .from("organization_settings")
      .select("display_name, legal_name, awb_brand_name")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const companyName =
    settings?.display_name ||
    settings?.awb_brand_name ||
    settings?.legal_name ||
    "Courier Company";

  if (dataset === "transactions") {
    const { data } = await supabase
      .from("finance_ledger")
      .select(`
        tracking_number,
        shipper_id,
        transaction_type,
        transaction_at,
        currency,
        cod_amount,
        delivery_charge,
        return_charge,
        total_charges,
        net_payable
      `)
      .eq("organization_id", organizationId)
      .order("transaction_at", { ascending: false });

    return {
      companyName,
      data: {
        title: "Finance Transactions",
        fileName: "finance-transactions",
        currency,
        columns: [
          { key: "awb", header: "AWB", width: 20 },
          { key: "shipper", header: "Shipper", width: 24 },
          { key: "account", header: "Account No.", width: 16 },
          { key: "type", header: "Transaction", width: 18 },
          { key: "date", header: "Date", width: 20 },
          { key: "currency", header: "Currency", width: 10 },
          { key: "cod", header: "COD", width: 14, numeric: true },
          { key: "delivery", header: "Delivery", width: 14, numeric: true },
          { key: "return", header: "Return", width: 14, numeric: true },
          { key: "charges", header: "Charges", width: 14, numeric: true },
          { key: "net", header: "Net Payable", width: 16, numeric: true },
        ],
        rows: (data ?? []).map((row) => {
          const shipper = shipperDirectory.get(row.shipper_id);

          return {
            awb: row.tracking_number,
            shipper: shipper?.name || "Shipper",
            account: shipper?.accountNumber || "Pending",
            type: row.transaction_type.replaceAll("_", " "),
            date: isoDate(row.transaction_at),
            currency: normalizeCurrency(row.currency || currency),
            cod: Number(row.cod_amount || 0),
            delivery: Number(row.delivery_charge || 0),
            return: Number(row.return_charge || 0),
            charges: Number(row.total_charges || 0),
            net: Number(row.net_payable || 0),
          };
        }),
      },
    };
  }

  if (dataset === "invoices") {
    const { data } = await supabase
      .from("invoices")
      .select(`
        invoice_number,
        settlement_id,
        shipper_id,
        status,
        currency,
        subtotal,
        tax_amount,
        total_amount,
        cod_collected,
        net_settlement_payable,
        invoice_date,
        due_date,
        settlement:settlements!invoices_settlement_id_fkey(settlement_number)
      `)
      .eq("organization_id", organizationId)
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: false });

    return {
      companyName,
      data: {
        title: "Invoice Register",
        fileName: "invoice-register",
        currency,
        columns: [
          { key: "invoice", header: "Invoice", width: 18 },
          { key: "settlement", header: "Settlement", width: 18 },
          { key: "shipper", header: "Shipper", width: 24 },
          { key: "account", header: "Account No.", width: 16 },
          { key: "invoice_date", header: "Invoice Date", width: 14 },
          { key: "due_date", header: "Due Date", width: 14 },
          { key: "status", header: "Status", width: 12 },
          { key: "currency", header: "Currency", width: 10 },
          { key: "cod", header: "COD", width: 14, numeric: true },
          { key: "subtotal", header: "Subtotal", width: 14, numeric: true },
          { key: "tax", header: "Tax", width: 12, numeric: true },
          { key: "total", header: "Invoice Total", width: 16, numeric: true },
          { key: "net", header: "Net Payable", width: 16, numeric: true },
        ],
        rows: (data ?? []).map((row) => {
          const shipper = shipperDirectory.get(row.shipper_id);
          const settlement = Array.isArray(row.settlement)
            ? row.settlement[0]
            : row.settlement;

          return {
            invoice: row.invoice_number,
            settlement: settlement?.settlement_number || String(row.settlement_id),
            shipper: shipper?.name || "Shipper",
            account: shipper?.accountNumber || "Pending",
            invoice_date: row.invoice_date || "",
            due_date: row.due_date || "",
            status: row.status.replaceAll("_", " "),
            currency: normalizeCurrency(row.currency || currency),
            cod: Number(row.cod_collected || 0),
            subtotal: Number(row.subtotal || 0),
            tax: Number(row.tax_amount || 0),
            total: Number(row.total_amount || 0),
            net: Number(row.net_settlement_payable || 0),
          };
        }),
      },
    };
  }

  if (dataset === "settlements") {
    const { data } = await supabase
      .from("settlements")
      .select(`
        settlement_number,
        shipper_id,
        status,
        currency,
        total_cod,
        total_delivery_charges,
        total_return_charges,
        total_charges,
        net_payable,
        period_from,
        period_to,
        created_at
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    return {
      companyName,
      data: {
        title: "Settlement Register",
        fileName: "settlement-register",
        currency,
        columns: [
          { key: "settlement", header: "Settlement", width: 18 },
          { key: "shipper", header: "Shipper", width: 24 },
          { key: "account", header: "Account No.", width: 16 },
          { key: "period_from", header: "Period From", width: 18 },
          { key: "period_to", header: "Period To", width: 18 },
          { key: "status", header: "Status", width: 12 },
          { key: "currency", header: "Currency", width: 10 },
          { key: "cod", header: "COD", width: 14, numeric: true },
          { key: "delivery", header: "Delivery", width: 14, numeric: true },
          { key: "return", header: "Return", width: 14, numeric: true },
          { key: "charges", header: "Charges", width: 14, numeric: true },
          { key: "net", header: "Net Payable", width: 16, numeric: true },
        ],
        rows: (data ?? []).map((row) => {
          const shipper = shipperDirectory.get(row.shipper_id);

          return {
            settlement: row.settlement_number,
            shipper: shipper?.name || "Shipper",
            account: shipper?.accountNumber || "Pending",
            period_from: isoDate(row.period_from),
            period_to: isoDate(row.period_to),
            status: row.status.replaceAll("_", " "),
            currency: normalizeCurrency(row.currency || currency),
            cod: Number(row.total_cod || 0),
            delivery: Number(row.total_delivery_charges || 0),
            return: Number(row.total_return_charges || 0),
            charges: Number(row.total_charges || 0),
            net: Number(row.net_payable || 0),
          };
        }),
      },
    };
  }

  const { data: codEntries } = await supabase
    .from("driver_cod_entries")
    .select(`
      shipment_id,
      driver_id,
      tracking_number,
      cod_amount,
      received_amount,
      outstanding_amount,
      delivered_at,
      driver:profiles!driver_cod_entries_driver_id_fkey(full_name, employee_code)
    `)
    .eq("organization_id", organizationId)
    .order("delivered_at", { ascending: false });

  const shipmentIds = (codEntries ?? []).map((row) => row.shipment_id);
  const { data: shipments } = shipmentIds.length
    ? await supabase
        .from("shipments")
        .select("id, shipper_id, currency")
        .eq("organization_id", organizationId)
        .in("id", shipmentIds)
    : { data: [] };

  const shipmentById = new Map(
    (shipments ?? []).map((shipment) => [
      shipment.id,
      shipment,
    ]),
  );

  return {
    companyName,
    data: {
      title: "COD Management Register",
      fileName: "cod-management-register",
      currency,
      columns: [
        { key: "awb", header: "AWB", width: 20 },
        { key: "shipper", header: "Shipper", width: 24 },
        { key: "account", header: "Account No.", width: 16 },
        { key: "driver", header: "Driver", width: 20 },
        { key: "driver_code", header: "Driver Code", width: 14 },
        { key: "delivered", header: "Delivered", width: 20 },
        { key: "currency", header: "Currency", width: 10 },
        { key: "cod", header: "COD", width: 14, numeric: true },
        { key: "received", header: "Received", width: 14, numeric: true },
        { key: "outstanding", header: "Outstanding", width: 16, numeric: true },
      ],
      rows: (codEntries ?? []).map((row) => {
        const shipment = shipmentById.get(row.shipment_id);
        const shipper = shipment?.shipper_id
          ? shipperDirectory.get(shipment.shipper_id)
          : null;
        const driver = Array.isArray(row.driver)
          ? row.driver[0]
          : row.driver;

        return {
          awb: row.tracking_number,
          shipper: shipper?.name || "Shipper",
          account: shipper?.accountNumber || "Pending",
          driver: driver?.full_name || "Driver",
          driver_code: driver?.employee_code || "",
          delivered: isoDate(row.delivered_at),
          currency: normalizeCurrency(shipment?.currency || currency),
          cod: Number(row.cod_amount || 0),
          received: Number(row.received_amount || 0),
          outstanding: Number(row.outstanding_amount || 0),
        };
      }),
    },
  };
}

function excelResponse(data: ExportData, companyName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(data.title, {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.addRow([companyName]);
  sheet.addRow([data.title]);
  sheet.addRow([
    "Organization Base Currency",
    data.currency,
    "Generated",
    new Date().toISOString(),
  ]);
  sheet.addRow(data.columns.map((column) => column.header));

  for (const row of data.rows) {
    sheet.addRow(
      data.columns.map((column) => row[column.key] ?? ""),
    );
  }

  sheet.mergeCells(1, 1, 1, data.columns.length);
  sheet.mergeCells(2, 1, 2, data.columns.length);

  sheet.getRow(1).font = {
    bold: true,
    size: 16,
    color: { argb: "FF13734B" },
  };
  sheet.getRow(2).font = { bold: true, size: 12 };
  sheet.getRow(4).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getRow(4).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF13734B" },
  };

  data.columns.forEach((column, index) => {
    const excelColumn = sheet.getColumn(index + 1);
    excelColumn.width = column.width;

    if (column.numeric) {
      excelColumn.numFmt = "#,##0.00";
    }
  });

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, data.rows.length + 4), column: data.columns.length },
  };

  return workbook.xlsx.writeBuffer().then(
    (buffer) =>
      new Response(buffer as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            `attachment; filename="${data.fileName}.xlsx"`,
          "Cache-Control": "no-store",
        },
      }),
  );
}

function fitText(
  value: ExportValue | undefined,
  maxCharacters: number,
) {
  const text = String(value ?? "");
  return text.length > maxCharacters
    ? `${text.slice(0, Math.max(1, maxCharacters - 1))}…`
    : text;
}

async function pdfResponse(
  data: ExportData,
  companyName: string,
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 28;
  const tableWidth = pageWidth - margin * 2;
  const totalWeight = data.columns.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  const columnWidths = data.columns.map(
    (column) => (column.width / totalWeight) * tableWidth,
  );

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawHeader() {
    page.drawText(companyName, {
      x: margin,
      y,
      size: 15,
      font: bold,
      color: rgb(0.075, 0.45, 0.294),
    });
    page.drawText(data.title, {
      x: pageWidth - margin - 190,
      y,
      size: 12,
      font: bold,
      color: rgb(0.12, 0.16, 0.14),
    });
    y -= 18;
    page.drawText(
      `Base currency: ${data.currency}  |  Generated: ${new Date().toISOString()}`,
      {
        x: margin,
        y,
        size: 6.5,
        font: regular,
        color: rgb(0.43, 0.49, 0.46),
      },
    );
    y -= 18;
  }

  function drawTableHeader() {
    page.drawRectangle({
      x: margin,
      y: y - 13,
      width: tableWidth,
      height: 19,
      color: rgb(0.075, 0.45, 0.294),
    });

    let x = margin + 3;
    data.columns.forEach((column, index) => {
      const width = columnWidths[index];
      page.drawText(
        fitText(column.header, Math.max(4, Math.floor(width / 4.5))),
        {
          x,
          y: y - 7,
          size: 5.5,
          font: bold,
          color: rgb(1, 1, 1),
        },
      );
      x += width;
    });

    y -= 22;
  }

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    drawHeader();
    drawTableHeader();
  }

  drawHeader();
  drawTableHeader();

  for (const row of data.rows) {
    if (y < 38) newPage();

    let x = margin + 3;
    data.columns.forEach((column, index) => {
      const width = columnWidths[index];
      const rawValue = row[column.key];
      const value = column.numeric
        ? Number(rawValue || 0).toFixed(2)
        : rawValue;
      page.drawText(
        fitText(value, Math.max(4, Math.floor(width / 4.2))),
        {
          x,
          y,
          size: 5.5,
          font: column.key === "account" ? bold : regular,
          color: rgb(0.12, 0.16, 0.14),
        },
      );
      x += width;
    });

    page.drawLine({
      start: { x: margin, y: y - 4 },
      end: { x: pageWidth - margin, y: y - 4 },
      thickness: 0.25,
      color: rgb(0.89, 0.92, 0.9),
    });
    y -= 15;
  }

  if (data.rows.length === 0) {
    page.drawText("No records available.", {
      x: margin,
      y,
      size: 9,
      font: regular,
      color: rgb(0.43, 0.49, 0.46),
    });
  }

  const bytes = await pdf.save();

  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition":
        `attachment; filename="${data.fileName}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function createFinanceExport(
  dataset: FinanceExportDataset,
  format: FinanceExportFormat,
) {
  const { data, companyName } = await loadExportData(dataset);

  return format === "xlsx"
    ? excelResponse(data, companyName)
    : pdfResponse(data, companyName);
}
