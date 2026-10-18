"use client";

import { useEffect } from "react";

export function AutoPrintLabel() {
  useEffect(() => {
    let active = true;
    const closeAfterPrint = () => window.close();
    window.addEventListener("afterprint", closeAfterPrint);

    async function printWhenReady() {
      await document.fonts?.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => undefined)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (active) window.print();
    }

    void printWhenReady();

    return () => {
      active = false;
      window.removeEventListener("afterprint", closeAfterPrint);
    };
  }, []);

  return <span className="sr-only" role="status">Opening the label print dialog.</span>;
}
