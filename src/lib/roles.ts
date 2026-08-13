export const appRoles = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
  "driver",
  "finance_staff",
  "customer_service",
  "shipper",
] as const;

export type AppRole = (typeof appRoles)[number];
export type AccountStatus = "pending" | "active" | "suspended" | "inactive";

export type Profile = {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  employee_code: string | null;
  role: AppRole;
  status: AccountStatus;
  can_delete_shipments: boolean;
};

export const internalRoles: readonly AppRole[] = [
  "super_admin",
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
  "finance_staff",
  "customer_service",
];

export const shipmentDeleteDelegateRoles: readonly AppRole[] = [
  "operations_admin",
  "warehouse_staff",
  "dispatcher",
  "finance_staff",
  "customer_service",
];

export function canDeleteShipments(profile: Pick<Profile, "role" | "can_delete_shipments">) {
  return profile.role === "super_admin"
    || (shipmentDeleteDelegateRoles.includes(profile.role) && profile.can_delete_shipments);
}

export function roleLabel(role: AppRole) {
  return role
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export function homeForRole(role: AppRole) {
  if (role === "shipper") return "/shipper";
  if (role === "driver") return "/driver";
  return "/dashboard";
}
