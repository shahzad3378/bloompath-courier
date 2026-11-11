/**
 * Pure duplicate protection for bulk carrier bookings.
 *
 * This helper does not authorize a carrier retry. A previously attempted
 * booking must be reconciled against the provider before a new request.
 */
export type CarrierBookingState =
  | "not_attempted"
  | "pending"
  | "unconfirmed"
  | "booked"
  | "failed_verified";

export type BulkBookingCandidate = {
  shipmentId: number;
  organizationId: string;
  fastDropAwb: string;
  state: CarrierBookingState;
  existingCarrierTracking?: string | null;
};

export type BulkBookingDecision = {
  candidate: BulkBookingCandidate;
  action: "book" | "use_existing" | "verify_provider" | "skip_duplicate";
  reason: string;
};

export function planBulkCarrierBookings(candidates: BulkBookingCandidate[]): BulkBookingDecision[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    const awb = candidate.fastDropAwb.trim().toUpperCase();
    if (!awb || !candidate.organizationId.trim()) {
      return { candidate, action: "verify_provider", reason: "Missing organization or FastDrop AWB." };
    }
    const key = `${candidate.organizationId}:${awb}`;
    if (seen.has(key)) {
      return { candidate, action: "skip_duplicate", reason: "Duplicate FastDrop AWB within this bulk selection." };
    }
    seen.add(key);
    if (candidate.state === "booked") {
      return candidate.existingCarrierTracking?.trim()
        ? { candidate, action: "use_existing", reason: "Use the existing carrier booking and stored label." }
        : { candidate, action: "verify_provider", reason: "Booked shipment has no carrier tracking; reconcile with provider." };
    }
    if (candidate.state === "pending" || candidate.state === "unconfirmed") {
      return { candidate, action: "verify_provider", reason: "Check carrier by FastDrop AWB before retrying." };
    }
    if (candidate.state === "failed_verified") {
      return { candidate, action: "book", reason: "Previous attempt confirmed not booked by provider." };
    }
    return { candidate, action: "book", reason: "No previous carrier booking attempt." };
  });
}
