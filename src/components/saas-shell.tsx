"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MapPinned,
  PackageCheck,
  Settings,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import type { ReactNode } from "react";

export function SaasShell({
  email,
  children,
}: {
  email: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  const items = [
    {
      label: "SaaS Control Center",
      href: "/saas",
      icon: LayoutDashboard,
    },
    {
      label: "Rates & Plans",
      href: "/saas/plans",
      icon: Settings,
    },
    {
      label: "Service Zones",
      href: "/saas/zones",
      icon: MapPinned,
    },
    {
      label: "Users & Roles",
      href: "/saas/users",
      icon: UserRoundCog,
    },
    {
      label: "Add Courier Company",
      href: "/saas/companies/new",
      icon: Building2,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#26372f]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[238px] border-r border-[#e2e9e5] bg-white lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-[#edf1ef] px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e7f4ed] text-sm font-black text-[#13734b]">
              BP
            </span>

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#203129]">
                BloomPath Courier
              </p>
              <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#188459]">
                SaaS Platform
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#98a5a0]">
            Platform
          </p>

          <div className="mt-3 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;

              const active =
                item.href === "/saas"
                  ? pathname === "/saas"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-[#eaf6ef] text-[#13734b]"
                      : "text-[#5f7068] hover:bg-[#f5f8f6] hover:text-[#26372f]"
                  }`}
                >
                  <Icon className="size-[18px]" />
                  <span className="flex-1">{item.label}</span>

                  {active ? (
                    <ChevronRight className="size-4 opacity-60" />
                  ) : null}
                </Link>
              );
            })}
          </div>

          <p className="mt-8 px-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#98a5a0]">
            Courier Workspace
          </p>

          <div className="mt-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#5f7068] transition hover:bg-[#f5f8f6] hover:text-[#26372f]"
            >
              <PackageCheck className="size-[18px]" />
              Courier Portal
            </Link>
          </div>
        </nav>

        <div className="border-t border-[#edf1ef] p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#64746d] hover:bg-[#f5f8f6]"
          >
            <Settings className="size-[18px]" />
            Platform Settings
          </Link>

          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-[#64746d] hover:bg-[#f5f8f6]"
          >
            <LogOut className="size-[18px]" />
            Back to Courier
          </Link>
        </div>
      </aside>

      <div className="lg:pl-[238px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#e4ebe7] bg-white/95 px-5 backdrop-blur lg:px-7">
          <div>
            <p className="text-base font-black text-[#203129]">
              SaaS Management
            </p>
            <p className="mt-0.5 hidden text-[10px] text-[#87938d] sm:block">
              BloomPath platform administration
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="bp-button-secondary hidden sm:inline-flex"
            >
              <PackageCheck className="size-4" />
              Courier Portal
            </Link>

            <div className="flex items-center gap-3 rounded-xl border border-[#e0e8e4] bg-white px-3 py-2">
              <span className="grid size-8 place-items-center rounded-lg bg-[#e7f4ed] text-[#13734b]">
                <ShieldCheck className="size-4" />
              </span>

              <div className="hidden max-w-[190px] sm:block">
                <p className="truncate text-xs font-bold text-[#34453c]">
                  {email || "Platform Admin"}
                </p>
                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[#87938d]">
                  Platform Admin
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-7 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
