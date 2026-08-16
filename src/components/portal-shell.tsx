"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeDollarSign, Bell, ChevronDown, CircleUserRound, ClipboardList,
  FileText, LayoutDashboard, LifeBuoy, LogOut, MapPinned, Menu, PackageCheck, RotateCcw,
  ScanLine, Settings, Truck, UserRoundCog, UsersRound, Warehouse, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { homeForRole, roleLabel, type Profile } from "@/lib/roles";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
  section?: "Overview" | "Operations" | "Network" | "Finance" | "Insights";
};

const internalNav: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    section: "Overview",
  },
  {
    label: "Shipments",
    href: "/shipments",
    icon: PackageCheck,
    section: "Operations",
  },
  {
    label: "Pickup Manifests",
    href: "/pickup-manifests",
    icon: ClipboardList,
    section: "Operations",
  },
  {
    label: "Warehouse",
    href: "/warehouse",
    icon: Warehouse,
    section: "Operations",
  },
  {
    label: "Dispatch",
    href: "/dispatch",
    icon: Truck,
    section: "Operations",
  },
  {
    label: "Live Map",
    href: "/live-map",
    icon: MapPinned,
    section: "Operations",
  },
  {
    label: "Returns",
    href: "/returns",
    icon: RotateCcw,
    section: "Operations",
  },
  {
    label: "Shippers",
    href: "/shippers",
    icon: UsersRound,
    section: "Network",
  },
  {
    label: "Users & Roles",
    href: "/users",
    icon: UserRoundCog,
    section: "Network",
  },
  {
    label: "COD & Finance",
    href: "/finance",
    icon: BadgeDollarSign,
    section: "Finance",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    section: "Insights",
  },
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

function NavigationItem({
  item,
  pathname,
  closeNavigation,
}: {
  item: NavItem;
  pathname: string;
  closeNavigation: () => void;
}) {
  const active =
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`);

  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2.5 text-[13px] text-[#a3ada8]"
        title="Coming in the next module"
      >
        <span className="flex items-center gap-3">
          <Icon className="size-[17px]" />
          {item.label}
        </span>

        <span className="rounded-full bg-[#f0f3f1] px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide">
          Soon
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={closeNavigation}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
        active
          ? "bg-[#eaf7f0] text-[#138253]"
          : "text-[#526159] hover:bg-[#f5f8f6] hover:text-[#17231e]"
      }`}
    >
      <Icon className="size-[17px]" />
      {item.label}
    </Link>
  );
}

export function PortalShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navItems = navForRole(profile);
  const activeLabel = navItems.find((item) => pathname === item.href)?.label ?? "Operations";

  return (
    <div className="min-h-screen bg-[#f6f8f7] lg:grid lg:grid-cols-[228px_1fr]">
      {open ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col border-r border-[#e7ece9] bg-white text-[#25352d] shadow-[4px_0_24px_rgba(23,35,30,0.025)] transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex h-20 items-center justify-between px-4">
          <Link href={homeForRole(profile.role)} className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#e9f7ef] text-sm font-black text-[#138253]">BP</span>
            <span>
              <span className="block text-[15px] font-black tracking-[-0.02em] text-[#17231e]">
                BloomPath
              </span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[#15905c]">
                Courier
              </span>
            </span>
          </Link>

          <button
            aria-label="Close navigation"
            className="text-[#78857e] lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {profile.role !== "shipper" && profile.role !== "driver" ? (
            <div className="space-y-5">
              {(
                [
                  "Overview",
                  "Operations",
                  "Network",
                  "Finance",
                  "Insights",
                ] as const
              ).map((section) => {
                const sectionItems = navItems.filter(
                  (item) => item.section === section,
                );

                if (sectionItems.length === 0) return null;

                return (
                  <div key={section}>
                    <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#9aa49f]">
                      {section}
                    </p>

                    <div className="space-y-0.5">
                      {sectionItems.map((item) => (
                        <NavigationItem
                          key={item.label}
                          item={item}
                          pathname={pathname}
                          closeNavigation={() => setOpen(false)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.16em] text-[#9aa49f]">
                Workspace
              </p>

              <div className="space-y-0.5">
                {navItems.map((item) => (
                  <NavigationItem
                    key={item.label}
                    item={item}
                    pathname={pathname}
                    closeNavigation={() => setOpen(false)}
                  />
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-[#edf1ef] p-3">
          <div className="pt-2">
            <div className="space-y-1">
              <Link
                href="/help"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                  pathname === "/help"
                    ? "bg-[#eef8f2] text-[#13734b]"
                    : "text-[#66756e] hover:bg-[#f5f8f6] hover:text-[#17231e]"
                }`}
              >
                <LifeBuoy className="size-[17px]" />
                Help & support
              </Link>

              {profile.role !== "shipper" && profile.role !== "driver" ? (
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                    pathname === "/settings"
                      ? "bg-[#eef8f2] text-[#13734b]"
                      : "text-[#66756e] hover:bg-[#f5f8f6] hover:text-[#17231e]"
                  }`}
                >
                  <Settings className="size-[17px]" />
                  Settings
                </Link>
              ) : null}

              <form action={logoutAction}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-[#66756e] transition hover:bg-[#f8f3f3] hover:text-[#a84444]">
                  <LogOut className="size-[17px]" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e8eeeb] bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-7">
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" className="grid size-10 place-items-center rounded-xl border border-[#dfe7e3] text-[#46554e] lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
            <div>
              <p className="text-[17px] font-black tracking-[-0.025em] text-[#17231e]">
                {activeLabel}
              </p>
              <p className="hidden text-[11px] text-[#8a9690] sm:block">
                Courier operations workspace
              </p>
            </div>
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
        <main className="px-4 py-6 sm:px-6 lg:px-7 lg:py-7">{children}</main>
      </div>
    </div>
  );
}
