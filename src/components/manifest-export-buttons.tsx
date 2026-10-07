"use client";
import { useState } from "react";

export function ManifestExportButtons({ href, disabled = false }: { href: string; disabled?: boolean }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function download(format: "pdf" | "excel") {
    setPending(format); setError("");
    try {
      const url = href.replace("{format}", format);
      const response = await fetch(url);
      if (!response.ok) throw new Error((await response.text()).slice(0, 300) || "Export failed. Please retry.");
      const expectedType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!response.headers.get("Content-Type")?.includes(expectedType)) throw new Error("Export unavailable. Refresh the page and sign in again if needed.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || `3pl-manifest.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Export failed. Please retry."); }
    finally { setPending(null); }
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    {(["pdf", "excel"] as const).map((format) => <button key={format} type="button" className="bp-button-secondary min-w-32 disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled || Boolean(pending)} onClick={() => download(format)}>{pending === format ? "Exporting…" : `Export ${format === "pdf" ? "PDF" : "Excel"}`}</button>)}
  </div><p role={error ? "alert" : "status"} className="min-h-5 text-sm text-red-700">{error}</p></div>;
}
