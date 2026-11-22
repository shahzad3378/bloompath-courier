const presenceTimeoutMs = 30 * 60 * 1000;

export function isDriverOnline(isOnline: boolean, recordedAt: string, now = Date.now()) {
  const age = now - Date.parse(recordedAt);
  return isOnline && age >= 0 && age < presenceTimeoutMs;
}
