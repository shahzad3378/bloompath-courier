"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Bell,
  Boxes,
  Braces,
  Building2,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PackageCheck,
  Plug,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  Truck,
  UserPlus,
  UserRoundCog,
  UsersRound,
  Warehouse,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import { logoutAction } from "@/app/login/actions";
import { homeForRole, roleLabel, type Profile } from "@/lib/roles";

type SimpleNavItem = { label: string; href: string; icon: typeof LayoutDashboard; disabled?: boolean };
type NavChild = { label: string; href: string };
type NavGroup = { key: string; label: string; icon: typeof LayoutDashboard; children: NavChild[] };

const internalSections: Array<{ label: string; direct?: SimpleNavItem[]; groups?: NavGroup[] }> = [
  { label: "Overview", direct: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Logistics",
    groups: [
      {
        key: "shipments",
        label: "Shipments",
        icon: PackageCheck,
        children: [
          { label: "All Shipments", href: "/shipments" },
          { label: "Create Shipment", href: "/shipments/new" },
          { label: "Bulk Upload", href: "/shipments/import" },
        ],
      },
      {
        key: "parcel-operations",
        label: "Parcel Operations",
        icon: Boxes,
        children: [
          { label: "Pickup Manifests", href: "/pickup-manifests" },
          { label: "Rider Support", href: "/driver-support" },
          { label: "Warehouse", href: "/warehouse" },
          { label: "Dispatch", href: "/dispatch" },
          { label: "Live Map", href: "/live-map" },
          { label: "Returns / RTO", href: "/returns" },
          { label: "Reverse & Exchange", href: "/reverse-exchange" },
          { label: "Service Zones", href: "/service-zones" },
        ],
      },
    ],
  },
  {
    label: "Network",
    groups: [
      {
        key: "shippers",
        label: "Shippers",
        icon: UsersRound,
        children: [
          { label: "Shipper List", href: "/shippers" },
          { label: "Create Shipper", href: "/shippers/new" },
        ],
      },
      {
        key: "team",
        label: "Team & Access",
        icon: UserRoundCog,
        children: [
          { label: "Users & Roles", href: "/users" },
          { label: "Create Driver", href: "/users#add-driver" },
        ],
      },
    ],
  },
  {
    label: "Integrations",
    groups: [
      {
        key: "api",
        label: "API & Integrations",
        icon: Plug,
        children: [
          { label: "Customer / Seller API", href: "/api-docs" },
          { label: "Courier Partner API", href: "/courier-integrations" },
        ],
      },
    ],
  },
  {
    label: "Finance",
    groups: [
      {
        key: "payments",
        label: "Payments",
        icon: BadgeDollarSign,
        children: [
          { label: "Transactions", href: "/finance" },
          { label: "COD Management", href: "/finance/cod" },
          { label: "Settlements", href: "/finance/settlements" },
          { label: "Invoices", href: "/finance/invoices" },
        ],
      },
    ],
  },
  {
    label: "Reports",
    groups: [
      {
        key: "reports",
        label: "Reports",
        icon: FileText,
        children: [
          { label: "Delivery Reports", href: "/reports" },
          { label: "Revenue Reports", href: "/reports/revenue" },
          { label: "Rider Reports", href: "/reports/riders" },
          { label: "Custom Reports", href: "/reports/custom" },
        ],
      },
    ],
  },
];

const shipperNav: SimpleNavItem[] = [
  { label: "Overview", href: "/shipper", icon: LayoutDashboard },
  { label: "My Shipments", href: "/shipments", icon: PackageCheck },
  { label: "New Shipment", href: "/shipments/new", icon: ClipboardList },
  { label: "Bulk Upload", href: "/shipments/import", icon: ScanLine },
  { label: "Pickup Manifests", href: "/pickup-manifests", icon: ClipboardList },
  { label: "Returns", href: "/shipper/returns", icon: RotateCcw },
  { label: "Invoices", href: "/shipper/invoices", icon: FileText },
];

const driverNav: SimpleNavItem[] = [
  { label: "My Route", href: "/driver", icon: Truck },
  { label: "History", href: "/driver/history", icon: ClipboardList },
];

function pathIsActive(pathname: string, href: string) {
  const cleanHref = href.split("#")[0];
  if (cleanHref === "/") return pathname === "/";
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

function activeInternalGroup(pathname: string) {
  for (const section of internalSections) for (const group of section.groups ?? []) if (group.children.some((child) => pathIsActive(pathname, child.href))) return group.key;
  return null;
}

function activeInternalLabel(pathname: string) {
  for (const section of internalSections) {
    for (const item of section.direct ?? []) if (pathIsActive(pathname, item.href)) return item.label;
    for (const group of section.groups ?? []) {
      const child = group.children.find((item) => pathIsActive(pathname, item.href));
      if (child) return child.label;
    }
  }
  return "Operations";
}

function SimpleNavigationItem({ item, pathname, closeNavigation }: { item: SimpleNavItem; pathname: string; closeNavigation: () => void }) {
  const active = pathIsActive(pathname, item.href);
  const Icon = item.icon;
  return <Link href={item.href} onClick={closeNavigation} className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${active ? "bg-[#eaf8f0] text-[#15905c]" : "text-[#526159] hover:bg-[#f6f8f7] hover:text-[#17231e]"}`}>
    {active ? <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-[#20a266]" /> : null}<Icon className="size-[17px]" />{item.label}
  </Link>;
}

function ExpandableNavigationGroup({ group, pathname, expanded, onToggle, closeNavigation }: { group: NavGroup; pathname: string; expanded: boolean; onToggle: () => void; closeNavigation: () => void }) {
  const Icon = group.icon;
  const parentActive = group.children.some((child) => pathIsActive(pathname, child.href));
  return <div>
    <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${parentActive ? "text-[#15905c]" : "text-[#596b82] hover:bg-[#f7f9f8] hover:text-[#17231e]"}`}>
      <Icon className="size-[18px] shrink-0" /><span className="flex-1">{group.label}</span><ChevronDown className={`size-4 text-[#86938d] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
    </button>
    {expanded ? <div className="ml-[25px] border-l border-[#dfe7e3] py-1 pl-[22px]"><div className="space-y-0.5">{group.children.map((child) => {
      const active = pathIsActive(pathname, child.href);
      return <Link key={`${group.key}-${child.href}`} href={child.href} onClick={closeNavigation} className={`block rounded-lg px-2 py-2 text-[12px] font-medium transition ${active ? "bg-[#f0faf4] text-[#15905c]" : "text-[#62728a] hover:bg-[#f7f9f8] hover:text-[#17231e]"}`}>{child.label}</Link>;
    })}</div></div> : null}
  </div>;
}

export function PortalShell({ profile, branding, isPlatformAdmin = false, children }: { profile: Profile; branding: { displayName: string; logoUrl: string | null }; isPlatformAdmin?: boolean; children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false); const [sidebarCollapsed, setSidebarCollapsed] = useState(false); const [searchText, setSearchText] = useState(""); const [notificationsOpen, setNotificationsOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  const tenantInitials = useMemo(() => branding.displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "CO", [branding.displayName]);
  const allowedInternalSections = internalSections.map(section => ({ ...section, groups: section.groups?.map(group => ({ ...group, children: group.children.filter(child => child.href !== '/driver-support' || ['super_admin','operations_admin','dispatcher','customer_service'].includes(profile.role)) })) }));
  const visibleInternalSections: typeof internalSections = isPlatformAdmin ? [...allowedInternalSections, { label: "Platform", direct: [{ label: "SaaS Management", href: "/saas", icon: Building2 }] }] : allowedInternalSections;
  const initialInternalGroup = profile.role !== "shipper" && profile.role !== "driver" ? activeInternalGroup(pathname) : null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(initialInternalGroup);
  const simpleNav = profile.role === "shipper" ? shipperNav : profile.role === "driver" ? driverNav : null;
  const activeLabel = simpleNav ? simpleNav.find((item) => pathIsActive(pathname, item.href))?.label ?? "Operations" : activeInternalLabel(pathname);
  function toggleGroup(key: string) { if (sidebarCollapsed) { setSidebarCollapsed(false); setExpandedGroup(key); return; } setExpandedGroup((current) => current === key ? null : key); }
  function submitGlobalSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = searchText.trim(); if (!value) return; router.push(`/shipments?q=${encodeURIComponent(value)}`); setSearchText(""); }

  return <div className={`min-h-screen bg-[#f6f8f7] lg:grid ${sidebarCollapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[245px_1fr]"}`}>
    {mobileOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} /> : null}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[245px] flex-col border-r border-[#e7ece9] bg-white text-[#25352d] shadow-[4px_0_24px_rgba(23,35,30,0.025)] transition-all duration-300 lg:sticky lg:top-0 lg:h-screen ${sidebarCollapsed ? "lg:w-[76px]" : "lg:w-[245px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className={`flex h-20 items-center ${sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <Link href={homeForRole(profile.role)} className="flex items-center gap-3">{branding.logoUrl ? <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e3ebe7] bg-white p-1"><img src={branding.logoUrl} alt={`${branding.displayName} logo`} className="max-h-full max-w-full object-contain" /></span> : <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f7ef] text-sm font-black text-[#138253]">{tenantInitials}</span>}{!sidebarCollapsed ? <span className="min-w-0"><span className="block max-w-[155px] truncate text-[15px] font-black tracking-[-0.02em] text-[#17231e]">{branding.displayName}</span><span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-[#15905c]">Courier</span></span> : null}</Link>
        <button aria-label="Close navigation" className="text-[#78857e] lg:hidden" onClick={() => setMobileOpen(false)}><X className="size-5" /></button>
      </div>
      <nav className={`flex-1 overflow-y-auto pb-5 pt-2 ${sidebarCollapsed ? "px-2" : "px-3"}`}>
        {simpleNav ? <div>{!sidebarCollapsed ? <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#9ba8ba]">Workspace</p> : null}<div className="space-y-0.5">{simpleNav.map((item) => <div key={item.label} title={sidebarCollapsed ? item.label : undefined} className={sidebarCollapsed ? "[&>a]:justify-center [&>a]:px-0 [&>a]:text-[0px]" : ""}><SimpleNavigationItem item={item} pathname={pathname} closeNavigation={() => setMobileOpen(false)} /></div>)}</div></div> : <div className="space-y-5">{visibleInternalSections.map((section) => <section key={section.label}>{!sidebarCollapsed ? <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#9ba8ba]">{section.label}</p> : null}<div className="space-y-0.5">{(section.direct ?? []).map((item) => <div key={item.label} title={sidebarCollapsed ? item.label : undefined} className={sidebarCollapsed ? "[&>a]:justify-center [&>a]:px-0 [&>a]:text-[0px]" : ""}><SimpleNavigationItem item={item} pathname={pathname} closeNavigation={() => setMobileOpen(false)} /></div>)}{(section.groups ?? []).map((group) => <div key={group.key} title={sidebarCollapsed ? group.label : undefined} className={sidebarCollapsed ? "[&>div>button]:justify-center [&>div>button]:px-0 [&>div>button>span]:hidden [&>div>button>svg:last-child]:hidden" : ""}><ExpandableNavigationGroup group={group} pathname={pathname} expanded={!sidebarCollapsed && expandedGroup === group.key} onToggle={() => toggleGroup(group.key)} closeNavigation={() => setMobileOpen(false)} /></div>)}</div></section>)}</div>}
      </nav>
      <div className={`border-t border-[#edf1ef] bg-white ${sidebarCollapsed ? "p-2" : "p-3"}`}>{!sidebarCollapsed ? <div className="rounded-xl bg-[#f0faf5] p-2"><Link href="/help" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white"><span className="grid size-9 place-items-center rounded-full bg-[#daf2e4] text-[#15905c]"><LifeBuoy className="size-[17px]" /></span><span className="min-w-0"><span className="block text-[12px] font-bold text-[#26372f]">Need help?</span><span className="block text-[10px] text-[#83908a]">Visit support center</span></span></Link></div> : null}<div className="mt-2 space-y-0.5">{profile.role !== "shipper" && profile.role !== "driver" ? <Link href="/settings" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium transition ${pathname === "/settings" ? "bg-[#eef8f2] text-[#13734b]" : "text-[#66756e] hover:bg-[#f5f8f6] hover:text-[#17231e]"}`}><Settings className="size-[16px]" />{!sidebarCollapsed ? "Settings" : null}</Link> : null}<form action={logoutAction}><button title={sidebarCollapsed ? "Sign out" : undefined} className={`flex w-full items-center gap-3 rounded-lg py-2 text-[12px] font-medium text-[#66756e] transition hover:bg-[#fff3f3] hover:text-[#a84444] ${sidebarCollapsed ? "justify-center px-0" : "px-3"}`}><LogOut className="size-[16px]" />{!sidebarCollapsed ? "Sign out" : null}</button></form></div></div>
    </aside>
    <div className="min-w-0"><header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e8eeeb] bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:px-7"><div className="flex min-w-0 items-center gap-3"><button aria-label="Open navigation" className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dfe7e3] text-[#46554e] lg:hidden" onClick={() => setMobileOpen(true)}><Menu className="size-5" /></button><button aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} className="hidden size-10 shrink-0 place-items-center rounded-xl border border-[#dfe7e3] text-[#46554e] transition hover:bg-[#f5f8f6] lg:grid" onClick={() => setSidebarCollapsed((current) => !current)}><Menu className="size-5" /></button></div><form onSubmit={submitGlobalSearch} className="mx-4 hidden w-full max-w-[560px] lg:block"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#829089]" /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Track AWB, reference, customer or phone..." className="h-11 w-full rounded-xl border border-[#dfe7e3] bg-[#f9fbfa] pl-11 pr-4 text-sm font-medium text-[#25352d] outline-none transition placeholder:text-[#9aa69f] focus:border-[#72b995] focus:bg-white focus:ring-4 focus:ring-[#15905c]/10" /></div></form><div className="flex items-center gap-2 sm:gap-3"><div className="relative"><button aria-label="Notifications" onClick={() => { setNotificationsOpen((current) => !current); setProfileOpen(false); }} className="relative grid size-10 place-items-center rounded-xl border border-[#e1e8e4] text-[#506058] transition hover:bg-[#f5f8f6]"><Bell className="size-5" /><span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-white bg-[#e1962f]" /></button>{notificationsOpen ? <div className="absolute right-0 top-12 z-50 w-[340px] overflow-hidden rounded-2xl border border-[#e0e8e4] bg-white shadow-[0_20px_50px_rgba(23,35,30,0.14)]"><div className="border-b border-[#edf1ef] px-4 py-3"><p className="text-sm font-black text-[#1d2d25]">Notifications</p><p className="mt-0.5 text-[11px] text-[#84918b]">Operational alerts will appear here</p></div><div className="px-4 py-8 text-center"><Bell className="mx-auto size-6 text-[#a4b0aa]" /><p className="mt-2 text-xs font-semibold text-[#64726b]">Notification feed is ready</p></div></div> : null}</div><button type="button" onClick={() => { setProfileOpen((current) => !current); setNotificationsOpen(false); }} className="relative flex items-center gap-2 rounded-xl border border-[#e1e8e4] bg-white p-1.5 pr-2 sm:gap-3 sm:pr-3"><span className="grid size-8 place-items-center rounded-lg bg-[#e7f4ed] text-[#13734b]"><CircleUserRound className="size-5" /></span><span className="hidden text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold text-[#24352d]">{profile.full_name || profile.email}</span><span className="block text-[10px] text-[#7a8881]">{roleLabel(profile.role)}</span></span><ChevronDown className={`hidden size-4 text-[#7a8881] transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} /></button>{profileOpen ? <div className="absolute right-4 top-[66px] z-50 w-56 rounded-2xl border border-[#e0e8e4] bg-white p-2 shadow-[0_20px_50px_rgba(23,35,30,0.14)] sm:right-6 lg:right-7">{profile.role !== "shipper" && profile.role !== "driver" ? <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#526159] transition hover:bg-[#f5f8f6]"><Settings className="size-4" />Settings</Link> : null}<form action={logoutAction}><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#a84444] transition hover:bg-[#fff3f3]"><LogOut className="size-4" />Sign out</button></form></div> : null}</div></header><main className="px-4 py-6 sm:px-6 lg:px-7 lg:py-7">{children}</main></div>
  </div>;
}
