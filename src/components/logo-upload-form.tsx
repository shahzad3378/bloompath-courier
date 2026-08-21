"use client";

import { FormEvent, useState } from "react";
import { ImageUp, LoaderCircle } from "lucide-react";

export function LogoUploadForm({ logoUrl, canEdit }: { logoUrl?: string | null; canEdit: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [currentLogoUrl, setCurrentLogoUrl] = useState(logoUrl ?? null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const logo = data.get("logo");
    if (!(logo instanceof File) || logo.size === 0) {
      setStatus("error");
      setMessage("Choose a logo image first.");
      return;
    }

    setPending(true);
    setMessage("");
    setStatus("idle");
    try {
      const response = await fetch("/api/settings/logo", { method: "POST", body: data });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; logoUrl?: string };
      if (!response.ok || !payload.logoUrl) throw new Error(payload.error || "Company logo could not be uploaded.");
      setCurrentLogoUrl(`${payload.logoUrl}?v=${Date.now()}`);
      setStatus("success");
      setMessage("Company logo uploaded successfully. AWBs and portal branding will use it automatically.");
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Company logo could not be uploaded.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#e0e8e4] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3 border-b border-[#edf1ef] pb-4">
        <ImageUp className="size-5 text-[#13734b]" />
        <div>
          <h2 className="font-bold text-[#26372f]">Company logo</h2>
          <p className="mt-1 text-xs text-[#87938d]">Used automatically on 4×6 and A4 AWBs.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe8e3] bg-[#f8faf9]">
          {currentLogoUrl ? <img src={currentLogoUrl} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs font-bold text-[#87938d]">No logo</span>}
        </div>

        {canEdit ? (
          <form onSubmit={submit} className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-bold text-[#516159]">
              Upload PNG, JPG or WebP · max 2 MB
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-2 block w-full rounded-xl border border-[#dbe5e0] bg-white px-3 py-2 text-sm" />
            </label>
            <button disabled={pending} className="h-11 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white disabled:opacity-60">
              {pending ? <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Uploading…</span> : "Upload logo"}
            </button>
          </form>
        ) : null}
      </div>

      {message ? <p className={`mt-3 text-xs font-semibold ${status === "success" ? "text-[#176a47]" : "text-[#a63e3e]"}`}>{message}</p> : null}
    </section>
  );
}
