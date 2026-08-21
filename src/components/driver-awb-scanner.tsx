"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Barcode, Camera, CameraOff, Search } from "lucide-react";

export function DriverAwbScanner() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  function openTracking(trackingValue: string) {
    const tracking = trackingValue.trim().toUpperCase();
    if (!tracking) {
      setMessage("Scan or enter an AWB number.");
      return;
    }
    window.location.href = `/driver/scan?awb=${encodeURIComponent(tracking)}`;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openTracking(value);
  }

  function stopCamera() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
    setMessage("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Camera scanning is not supported by this browser. You can still enter the AWB manually.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);

      requestAnimationFrame(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);

        const BarcodeDetectorCtor = (globalThis as any).BarcodeDetector;
        if (!BarcodeDetectorCtor) {
          setMessage("Camera opened, but automatic barcode detection is not available in this browser. Use the camera with a supported browser or enter the AWB manually.");
          return;
        }

        const detector = new BarcodeDetectorCtor({
          formats: ["code_39", "code_128", "qr_code", "ean_13", "ean_8"],
        });

        timerRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const detected = await detector.detect(video);
            const rawValue = String(detected?.[0]?.rawValue ?? "").trim();
            if (rawValue) {
              setValue(rawValue.toUpperCase());
              stopCamera();
              openTracking(rawValue);
            }
          } catch {
            // Keep scanning; intermittent detector errors are common while camera focuses.
          }
        }, 450);
      });
    } catch {
      setMessage("Camera permission was not granted. Allow camera access in browser settings and try again.");
      stopCamera();
    }
  }

  useEffect(() => () => stopCamera(), []);

  return (
    <section className="rounded-2xl border border-[#d9e7df] bg-white p-4 shadow-[0_8px_30px_rgba(24,51,39,0.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-[#13734b]">
          <Barcode className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#26372f]">Scan / Enter AWB</h2>
          <p className="mt-1 text-xs leading-5 text-[#7b8982]">
            Open the phone camera to scan the AWB barcode, or enter the tracking number manually. Only pending AWBs assigned to this driver can open.
          </p>
        </div>
      </div>

      {cameraOpen ? (
        <div className="mt-4 overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <button type="button" onClick={stopCamera} className="flex h-11 w-full items-center justify-center gap-2 bg-[#26372f] text-sm font-bold text-white">
            <CameraOff className="size-4" /> Close camera
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => void startCamera()} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#13734b] px-5 text-sm font-bold text-white">
          <Camera className="size-5" /> Scan with Camera
        </button>
      )}

      <div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9aa59f]">
        <span className="h-px flex-1 bg-[#e4ebe7]" /> or enter manually <span className="h-px flex-1 bg-[#e4ebe7]" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (message) setMessage("");
          }}
          autoComplete="off"
          inputMode="text"
          placeholder="Scan or enter tracking number"
          className="h-11 flex-1 rounded-xl border border-[#dbe5e0] bg-white px-3 text-sm font-semibold uppercase text-[#25352d] outline-none transition focus:border-[#2b9466] focus:ring-4 focus:ring-[#2b9466]/10"
        />
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#13734b] bg-white px-5 text-sm font-bold text-[#13734b]">
          <Search className="size-4" /> Open AWB
        </button>
      </form>
      {message ? <p className="mt-3 rounded-lg bg-[#fff3f3] px-3 py-2 text-xs font-semibold text-[#a63e3e]">{message}</p> : null}
    </section>
  );
}
