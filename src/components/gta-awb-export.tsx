"use client";

import {useRef, useState} from "react";
import type {ReactNode} from "react";

export function GtaAwbExport({children}:{children:ReactNode}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const getBoxes = () => Array.from(containerRef.current?.querySelectorAll<HTMLInputElement>("input[data-gta-awb]") ?? []);

  const toggleAll = () => {
    const boxes = getBoxes();
    const shouldSelect = boxes.some(box => !box.checked);
    boxes.forEach(box => { box.checked = shouldSelect; });
  };

  const downloadSelected = async () => {
    const ids = getBoxes().filter(box => box.checked && box.dataset.booking).map(box => box.dataset.booking!);
    if (!ids.length || busy) {
      if (!ids.length) setError("Pehle AWBs select karein.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/courier-integrations/gta-airskip/labels/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ids}),
      });
      if (!response.ok) throw new Error((await response.text()) || "Selected 4×6 labels download nahi ho sakay.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "gta-airskip-4x6-labels.pdf";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Selected labels download nahi ho sakay.");
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={toggleAll} className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm">Select all on this page</button>
      <button type="button" onClick={downloadSelected} disabled={busy} className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy ? "Preparing labels…" : "Download selected 4×6 labels (PDF)"}</button>
      <span className="text-sm text-[var(--muted)]">Unconfirmed AWBs are not included.</span>
    </div>
    {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : null}
    <div ref={containerRef}>{children}</div>
  </div>;
}
