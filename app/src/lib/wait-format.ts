/**
 * mm:ss for a wait, h:mm once it's embarrassing.
 *
 * Lives in its own module, away from the queries in lib/waiter-console,
 * because that one is `server-only` and this is needed by the client
 * components that render the timers. Importing a value from a
 * server-only module into a client component fails the build — which is
 * the guard working, not a nuisance to route around.
 */
export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  if (whole < 3600) {
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
