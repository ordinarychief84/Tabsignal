/**
 * TabCall Wear SDK — TypeScript core.
 *
 * A zero-dependency client for the TabCall wearable API (/api/wear/*).
 * Runs anywhere `fetch` exists: Fitbit SDK companions, Samsung Tizen
 * web widgets, React Native watch companions, Node tooling, browsers.
 * The Swift (watchOS) and Kotlin (Wear OS) clients in this package
 * mirror this class 1:1 — keep the three in sync when the API grows.
 *
 * Lifecycle:
 *   1. Staff member generates a 6-digit code at /staff/watch on their
 *      phone (their session mints it).
 *   2. Watch calls `pair(code)` → long-lived device token, persisted
 *      via your `onToken` hook (Keychain / SharedPreferences / etc).
 *   3. Watch polls `getQueue()` at the pace the server suggests
 *      (`pollAfterMs`), or use `startPolling()` which handles pacing
 *      and backoff for you. Register FCM via `registerPushToken` on
 *      Wear OS so a buzz wakes the app between polls.
 *   4. `acknowledge(id)` / `resolve(id, action)` from the wrist.
 *
 * Token death (revoked from /staff/watch, staff suspended, re-pair)
 * surfaces as TabCallWearError with status 401 — catch it, wipe the
 * stored token, and show the pairing screen again.
 */

export type RequestType = "DRINK" | "BILL" | "HELP" | "REFILL";
export type RequestStatus = "PENDING" | "ACKNOWLEDGED" | "RESOLVED" | "ESCALATED";
export type ResolutionAction =
  | "SERVED"
  | "COMPED"
  | "REFUSED"
  | "ESCALATED"
  | "NOT_ACTIONABLE"
  | "OTHER";

export type WearRequestItem = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  /** Table label as printed on the QR tent ("Table 7", "Bar 2"). */
  table: string;
  note: string | null;
  /** Venue requires an ID check before serving this (first drink). */
  idCheck: boolean;
  ageSeconds: number;
  /** This staff member covers the table the request came from. */
  assignedToMe: boolean;
  /** This staff member acknowledged it. */
  mine: boolean;
  ackedBy: string | null;
};

export type WearQueue = {
  serverTime: string;
  staff: { id: string; name: string };
  /** Server-suggested delay before the next poll. Honor it — it drops
   *  to ~5s when something is open and relaxes when the floor is quiet. */
  pollAfterMs: number;
  requests: WearRequestItem[];
};

export type PairResult = {
  apiVersion: number;
  token: string;
  device: { id: string; name: string; platform: string };
  staff: { id: string; name: string };
  venue: { name: string; slug: string };
};

export type AckResult = {
  id: string;
  status: RequestStatus;
  mine: boolean;
  ackedBy: string | null;
  alreadyAcked: boolean;
};

export type ResolveResult = {
  id: string;
  status: RequestStatus;
  resolutionAction: ResolutionAction | null;
  alreadyResolved: boolean;
};

export class TabCallWearError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `${code} (HTTP ${status})`);
    this.name = "TabCallWearError";
    this.status = status;
    this.code = code;
  }

  /** Token is dead (revoked / rotated / staff removed) — re-pair. */
  get needsRepair(): boolean {
    return this.status === 401;
  }
}

export type TabCallWearOptions = {
  /** e.g. "https://tab-call.com" — no trailing slash needed. */
  baseUrl: string;
  /** Restore a previously persisted device token. */
  token?: string | null;
  /** Called whenever the SDK obtains a new token — persist it here. */
  onToken?: (token: string) => void | Promise<void>;
  /** Injectable for tests / exotic runtimes. Defaults to global fetch. */
  fetch?: typeof fetch;
};

export type StopPolling = () => void;

const SDK_VERSION = "1.0.0";

export class TabCallWear {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onToken?: (token: string) => void | Promise<void>;
  private token: string | null;

  constructor(opts: TabCallWearOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
    this.onToken = opts.onToken;
    this.token = opts.token ?? null;
  }

  get isPaired(): boolean {
    return this.token !== null;
  }

  /** Exchange a 6-digit pairing code for a device token. */
  async pair(
    code: string,
    info?: { name?: string; platform?: string },
  ): Promise<PairResult> {
    const body = await this.request<PairResult>("POST", "/api/wear/claim", {
      auth: false,
      body: {
        code,
        name: info?.name ?? "Watch",
        platform: info?.platform ?? "other",
      },
    });
    this.token = body.token;
    await this.onToken?.(body.token);
    return body;
  }

  /** Forget the stored token (does not revoke server-side — that's the
   *  staff console's job; a forgotten token simply stops being used). */
  unpair(): void {
    this.token = null;
  }

  async getQueue(): Promise<WearQueue> {
    return this.request<WearQueue>("GET", "/api/wear/queue", { auth: true });
  }

  async acknowledge(requestId: string): Promise<AckResult> {
    return this.request<AckResult>(
      "POST",
      `/api/wear/requests/${encodeURIComponent(requestId)}/ack`,
      { auth: true },
    );
  }

  async resolve(
    requestId: string,
    action: ResolutionAction,
    note?: string,
  ): Promise<ResolveResult> {
    return this.request<ResolveResult>(
      "POST",
      `/api/wear/requests/${encodeURIComponent(requestId)}/resolve`,
      { auth: true, body: { action, ...(note ? { note } : {}) } },
    );
  }

  /** Register (token) or clear (null) the watch's own push token. */
  async registerPushToken(token: string | null): Promise<void> {
    await this.request<{ ok: boolean }>("POST", "/api/wear/fcm-token", {
      auth: true,
      body: { token },
    });
  }

  /**
   * Poll the queue at the server-suggested pace. Returns a stop
   * function. Errors don't kill the loop — transient failures back off
   * exponentially (capped at 60s) and auth failures are surfaced via
   * `onError` so the app can flip to its pairing screen.
   */
  startPolling(
    onQueue: (queue: WearQueue) => void,
    opts?: { onError?: (err: unknown) => void; immediate?: boolean },
  ): StopPolling {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let errorStreak = 0;

    const tick = async () => {
      if (stopped) return;
      let delay: number;
      try {
        const queue = await this.getQueue();
        errorStreak = 0;
        if (stopped) return;
        onQueue(queue);
        delay = Math.max(1_000, queue.pollAfterMs);
      } catch (err) {
        errorStreak += 1;
        opts?.onError?.(err);
        if (err instanceof TabCallWearError && err.needsRepair) return; // dead token — stop
        delay = Math.min(60_000, 2_000 * 2 ** Math.min(errorStreak, 5));
      }
      if (!stopped) timer = setTimeout(() => void tick(), delay);
    };

    if (opts?.immediate === false) {
      timer = setTimeout(() => void tick(), 0);
    } else {
      void tick();
    }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  /* ------------------------------ plumbing ----------------------------- */

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: { auth: boolean; body?: unknown },
  ): Promise<T> {
    if (opts.auth && !this.token) {
      throw new TabCallWearError(401, "NOT_PAIRED", "No device token — call pair() first.");
    }
    const headers: Record<string, string> = {
      "x-tabcall-wear-sdk": `ts/${SDK_VERSION}`,
    };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) headers.authorization = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      throw new TabCallWearError(0, "NETWORK", err instanceof Error ? err.message : "network error");
    }

    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* non-JSON error body */ }

    if (!res.ok) {
      const code =
        typeof payload === "object" && payload !== null && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "HTTP_ERROR";
      const detail =
        typeof payload === "object" && payload !== null && "detail" in payload
          ? String((payload as { detail: unknown }).detail)
          : undefined;
      throw new TabCallWearError(res.status, code, detail);
    }
    return payload as T;
  }
}
