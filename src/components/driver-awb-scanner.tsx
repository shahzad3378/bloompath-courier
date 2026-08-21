"use client";

import { FormEvent, useState } from "react";
import { Barcode, Search } from "lucide-react";

type DriverAwbScannerProps = {
  assigned: Array<{
    trackingNumber: string;
    href: string;
  }>;
};

export function DriverAwbScanner({ assigned }: DriverAwbScannerProps) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tracking = value.trim().toUpperCase();
    if (!tracking) {
      setMessage("Scan or enter an AWB number.");
      return;
    }

    const match = assigned.find(
      (item) => item.trackingNumber.toUpperCase() === tracking,
    );

    if (!match) {
      setMessage("This AWB is not assigned to your active route or is already completed.");
      return;
    }

    window.location.href = match.href;
  }

  return (
    <section className="rounded-2xl border border-[#d9e7df] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
          <Barcode className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#26372f]">Scan / Enter AWB</h2>
          <p className="mt-1 text-xs leading-5 text-[#7b8982]">
            Scan a barcode with the device scanner or type the tracking number to open the assigned delivery stop.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (message) setMessage("");
          }}
          autoFocus
          autoComplete="off"
          inputMode="text"
          placeholder="Scan or enter tracking number"
          className="h-11 flex-1 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold uppercase text-[#25352d] outline-none transition focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white"
        >
          <Search className="size-4" />
          Open AWB
        </button>
      </form>

      {message ? (
        <p className="mt-3 rounded-lg bg-[#fff3f3] px-3 py-2 text-xs font-semibold text-[#a63e3e]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
