"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign, Bell, ChevronDown, CircleUserRound, ClipboardList,
  FileText, LayoutDashboard, LifeBuoy, LogOut, Menu, PackageCheck, RotateCcw,
  ScanLine, Settings, Truck, UserRoundCog, UsersRound, Warehouse, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { homeForRole, roleLabel, type Profile } from "@/lib/roles";

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; disabled?: boolean };

const internalNav: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Shipments", href: "/shipments", icon: PackageCheck },
  { label: "Pickup Manifests", href: "/pickup-manifests", icon: ClipboardList },
  { label: "Warehouse", href: "/warehouse", icon: Warehouse },
  { label: "Dispatch", href: "/dispatch", icon: Truck },
  { label: "Returns", href: "/returns", icon: RotateCcw },
  { label: "COD & Finance", href: "/finance", icon: BadgeDollarSign },
  { label: "Shippers", href: "/shippers", icon: UsersRound },
  { label: "Users & Roles", href: "/users", icon: UserRoundCog },
  { label: "Reports", href: "/reports", icon: FileText },
];

const shipperNav: NavItem[] = [
  { label: "Overview", href: "/shipper", icon: LayoutDashboard },
  { label: "New Shipment", href: "/shipments/new", icon: ClipboardList },
  { label: "Bulk Upload", href: "/shipments/import", icon: ScanLine },
  { label: "My Shipments", href: "/shipments", icon: PackageCheck },
  { label: "Dispatch Manifests", href: "/pickup-manifests", icon: ClipboardList },
  { label: "Returns", href: "/shipper/returns", icon: RotateCcw, disabled: true },
  { label: "Invoices", href: "/shipper/invoices", icon: FileText, disabled: true },
];

const driverNav: NavItem[] = [
  { label: "My Route", href: "/driver", icon: Truck },
  { label: "History", href: "/driver/history", icon: ClipboardList, disabled: true },
];

function navForRole(profile: Profile) {
  if (profile.role === "shipper") return shipperNav;
  if (profile.role === "driver") return driverNav;
  return internalNav;
}

export function PortalShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navItems = navForRole(profile);
  const activeLabel = navItems.find((item) => pathname === item.href)?.label ?? "Operations";

  return (
    <div className="min-h-screen bg-[#f4f7f6] lg:grid lg:grid-cols-[270px_1fr]">
      {open ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col bg-[#10291f] text-white transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <Link href={homeForRole(profile.role)} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#2ca66e] text-sm font-black">BP</span>
            <span><span className="block font-bold tracking-tight">BloomPath Courier</span><span className="block text-[10px] uppercase tracking-[0.16em] text-white/45">Operations System</span></span>
          </Link>
          <button aria-label="Close navigation" className="text-white/55 lg:hidden" onClick={() => setOpen(false)}><X className="size-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Workspace</p>
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              if (item.disabled) {
                return (
                  <div key={item.label} className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2.5 text-sm text-white/35" title="Coming in the next module">
                    <span className="flex items-center gap-3"><Icon className="size-[18px]" />{item.label}</span><span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] uppercase">Soon</span>
                  </div>
                );
              }
              return (
                <Link key={item.label} href={item.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-[#2ca66e] text-white shadow-lg shadow-black/10" : "text-white/65 hover:bg-white/8 hover:text-white"}`}><Icon className="size-[18px]" />{item.label}</Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="border-t border-white/10 pt-3">
            <div className="space-y-1">
              <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/35">
                <LifeBuoy className="size-[17px]" />
                Help & support
              </span>

              <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/35">
                <Settings className="size-[17px]" />
                Settings
              </span>

              <form action={logoutAction}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-white/60 transition hover:bg-white/8 hover:text-white">
                  <LogOut className="size-[17px]" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[#e1e8e4] bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" className="grid size-10 place-items-center rounded-xl border border-[#dfe7e3] text-[#46554e] lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
            <div><p className="text-lg font-bold tracking-tight text-[#17231e]">{activeLabel}</p><p className="hidden text-xs text-[#7a8881] sm:block">Live courier operations workspace</p></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button aria-label="Notifications" className="relative grid size-10 place-items-center rounded-xl border border-[#e1e8e4] text-[#506058]"><Bell className="size-5" /><span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-white bg-[#e1962f]" /></button>
            <div className="flex items-center gap-2 rounded-xl border border-[#e1e8e4] bg-white p-1.5 pr-2 sm:gap-3 sm:pr-3">
              <span className="grid size-8 place-items-center rounded-lg bg-[#e7f4ed] text-[#13734b]"><CircleUserRound className="size-5" /></span>
              <span className="hidden text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold text-[#24352d]">{profile.full_name || profile.email}</span><span className="block text-[10px] text-[#7a8881]">{roleLabel(profile.role)}</span></span>
              <ChevronDown className="hidden size-4 text-[#7a8881] sm:block" />
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
