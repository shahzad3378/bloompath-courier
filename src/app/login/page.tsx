import { Boxes, CheckCircle2, MapPinned, PackageCheck, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { hasSupabaseEnv } from "@/lib/env";

export const metadata = { title: "Sign in" };

const features = [
  { icon: PackageCheck, text: "AWB to proof of delivery" },
  { icon: Boxes, text: "Warehouse scan operations" },
  { icon: MapPinned, text: "Dispatch and route control" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; brand?: string }> }) {
  const params = await searchParams;
  const configured = hasSupabaseEnv();
  const isFastDrop = params.brand === "fastdrop";
  const brandName = isFastDrop ? "Fast Drop" : "BloomPath Courier";
  const portalName = isFastDrop ? "Shipper Portal" : "Operations Control System";

  return (
    <main className="grid min-h-screen bg-[#eef4f1] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden overflow-hidden bg-[#10291f] p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-20 size-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-36 -left-20 size-[32rem] rounded-full bg-[#1a6f4c]/35 blur-3xl" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className={`grid size-11 place-items-center rounded-xl text-lg font-black text-white ${isFastDrop ? "bg-[#1f4e78]" : "bg-[#36b779]"}`}>{isFastDrop ? "FD" : "BP"}</div>
            <div><p className="text-lg font-bold tracking-tight">{brandName}</p><p className="text-xs text-white/55">{portalName}</p></div>
          </div>
          <div className="mt-24 max-w-xl">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.22em] text-[#70d4a2]">{isFastDrop ? "Fast Drop shipper access" : "One operational truth"}</p>
            <h1 className="text-5xl font-bold leading-[1.08] tracking-[-0.04em]">{isFastDrop ? "Manage your Fast Drop shipments." : "Every shipment. Every scan. Fully controlled."}</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-white/65">{isFastDrop ? "Sign in to book shipments and follow delivery updates through your Fast Drop shipper account." : "Manage warehouse intake, dispatch, delivery attempts, returns, COD and invoicing from one secure platform."}</p>
          </div>
        </div>
        <div className="relative z-10 grid gap-3 sm:grid-cols-3">
          {features.map(({ icon: Icon, text }) => (
            <div key={text} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm"><Icon className="mb-3 size-5 text-[#70d4a2]" /><p className="text-sm font-medium leading-5 text-white/80">{text}</p></div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="fade-up w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className={`grid size-10 place-items-center rounded-xl font-black text-white ${isFastDrop ? "bg-[#1f4e78]" : "bg-[#13734b]"}`}>{isFastDrop ? "FD" : "BP"}</div>
            <div><p className="font-bold">{brandName}</p><p className="text-xs text-[#718079]">{portalName}</p></div>
          </div>
          <div className="rounded-[28px] border border-white bg-white p-7 shadow-[0_28px_70px_rgba(25,55,42,0.11)] sm:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e7f4ed] text-[#13734b]"><ShieldCheck className="size-6" /></div>
            <h2 className="mt-6 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">Welcome back</h2>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7771]">{isFastDrop ? "Sign in with the shipper account provided by Fast Drop." : "Sign in with the account provided by your administrator."}</p>

            {!configured || params.error === "setup" ? (
              <div className="mt-5 rounded-xl border border-[#e9d5a9] bg-[#fff9ec] px-4 py-3 text-sm leading-5 text-[#8b611d]">Supabase connection is pending. The interface is ready; connect the new courier project to activate login.</div>
            ) : null}
            {params.error === "access" ? (
              <div className="mt-5 rounded-xl border border-[#f0c6c6] bg-[#fff4f4] px-4 py-3 text-sm text-[#a93434]">This account is pending, inactive or does not have portal access.</div>
            ) : null}

            <LoginForm />
            <div className="mt-7 flex items-center gap-2 border-t border-[#e8eeeb] pt-5 text-xs text-[#718079]"><CheckCircle2 className="size-4 text-[#299865]" /> Secure, role-based access</div>
          </div>
          <p className="mt-6 text-center text-xs text-[#829089]">© 2026 {brandName}{isFastDrop ? " · Secure shipper portal" : " · Version 1 foundation"}</p>
        </div>
      </section>
    </main>
  );
}
