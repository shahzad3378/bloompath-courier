// GTA does not authenticate its callbacks. Treat them only as hints to pull verified tracking.
export function gtaWebhookHint(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  const tracking = row.TrackingNumber, load = row.LoadNumber;
  if (typeof tracking !== "string" || typeof load !== "string" || !/^[A-Za-z0-9-]{2,100}$/.test(tracking) || !/^[A-Za-z0-9-]{2,100}$/.test(load)) return null;
  return { tracking, load };
}
