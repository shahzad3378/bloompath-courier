import type { LucideIcon } from "lucide-react";

export function EmptyModule({ icon: Icon, eyebrow, title, description, action }: { icon: LucideIcon; eyebrow: string; title: string; description: string; action: string }) {
  return (
    <div className="mx-auto max-w-[1200px]">
      <p className="text-sm font-semibold text-[#188459]">{eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-[#17231e]">{title}</h1>
      <div className="mt-7 grid min-h-[430px] place-items-center rounded-2xl border border-[#e0e8e4] bg-white p-8 text-center shadow-[0_8px_30px_rgba(24,51,39,0.045)]"><div><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e7f4ed] text-[#188459]"><Icon className="size-8" /></div><h2 className="mt-5 text-xl font-bold text-[#25372e]">Module foundation ready</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7a8881]">{description}</p><button disabled className="mt-6 rounded-xl bg-[#dce9e2] px-5 py-3 text-sm font-bold text-[#668075]">{action}</button></div></div>
    </div>
  );
}
