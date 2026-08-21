import type { Shipment } from "@/lib/shipments";
export type DispatchRunStatus = "draft" | "handed_over" | "completed";
export type DeliveryOutcome = "delivered" | "undelivered";
export type DispatchRun = { id: number; organization_id: string; run_number: string; route_name: string; driver_id: string; status: DispatchRunStatus; created_by: string; handed_over_by: string | null; handed_over_at: string | null; completed_at: string | null; created_at: string; updated_at: string; };
export type DispatchRunItem = { id: number; run_id: number; shipment_id: number; stop_sequence?: number | null; outcome: DeliveryOutcome | null; completed_at: string | null; shipments: Shipment; };
export type DeliveryAttempt = { id: number; shipment_id: number; attempt_number: number; outcome: DeliveryOutcome; undelivered_reason: string | null; notes: string | null; proof_path: string; performed_by: string; created_at: string; };
export const dispatchStatusLabels: Record<DispatchRunStatus, string> = { draft: "Draft", handed_over: "With driver", completed: "Completed" };
export const undeliveredReasons = [["customer_unavailable", "Customer unavailable"], ["customer_refused", "Customer refused"], ["wrong_address", "Wrong address"], ["phone_unreachable", "Phone unreachable"], ["reschedule_requested", "Reschedule requested"], ["cash_not_ready", "Cash not ready"], ["restricted_access", "Restricted access"], ["other", "Other"]] as const;
export function dispatchStatusClass(status: DispatchRunStatus) { if (status === "completed") return "bg-[#e4f3ea] text-[#166b47]"; if (status === "handed_over") return "bg-[#e7effb] text-[#356aa6]"; return "bg-[#eef1ef] text-[#617068]"; }
