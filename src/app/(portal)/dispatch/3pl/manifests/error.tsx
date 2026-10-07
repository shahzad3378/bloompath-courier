"use client";
export default function ManifestError({ reset }: { reset: () => void }) {
  return <div className="bp-panel p-6"><h2 className="text-lg font-bold">Manifest could not be loaded</h2><p role="alert" className="my-4 text-sm text-[#66756e]">Check your connection and try again. Your saved manifests are retained.</p><button type="button" onClick={reset} className="bp-button">Try again</button></div>;
}
