export const HEARTBEAT_STATUS = {
  DOWN: 0,
  UP: 1,
  PENDING: 2,
  MAINTENANCE: 3,
  DEGRADED: 4,
} as const;

/**
 * Previous states that must not be "held" while a failure escalates.
 *
 * MAINTENANCE is a window, not a health verdict: if a check fails while a
 * maintenance window is active the real state is unknown, so preserving
 * MAINTENANCE would mask an outage until the retry limit was exceeded (and
 * with max_retries=0 it would skip the retry window entirely). Those
 * transitions therefore fall back to PENDING.
 */
const NON_HEALTHY_HOLD_STATES: readonly number[] = [
  HEARTBEAT_STATUS.MAINTENANCE,
  HEARTBEAT_STATUS.DEGRADED,
];

export function getCheckInterval(
  interval: number,
  retryInterval: number,
  previousStatus: number | null,
  previousDownCount: number,
): number {
  return previousStatus === HEARTBEAT_STATUS.DOWN || previousDownCount > 0
    ? retryInterval
    : interval;
}

export function determineEffectiveStatus(
  resultStatus: number,
  previousStatus: number | null,
  previousDownCount: number,
  maxRetries: number,
): { status: number; downCount: number } {
  if (resultStatus === HEARTBEAT_STATUS.DOWN) {
    const downCount = Math.max(0, previousDownCount) + 1;
    const retryLimit = Math.max(0, Math.floor(maxRetries));

    if (downCount <= retryLimit) {
      // Hold the last known state only when it represents actual health.
      // Otherwise degrade to PENDING so a maintenance/degraded monitor that
      // starts failing is not reported as still being intentionally offline.
      const holdable =
        previousStatus !== null &&
        !NON_HEALTHY_HOLD_STATES.includes(previousStatus);
      return {
        status: holdable ? previousStatus : HEARTBEAT_STATUS.PENDING,
        downCount,
      };
    }
    return { status: HEARTBEAT_STATUS.DOWN, downCount };
  }

  return { status: resultStatus, downCount: 0 };
}

export type StatusTransition = {
  isDown: boolean;
  isRecovery: boolean;
  /** Entering DEGRADED from anything else: slow now, answering still. */
  isDegraded: boolean;
};

/**
 * Which incident actions a change in stored status implies.
 *
 * Every state that means "not answering healthily" counts as a previous
 * unhealthy state, because a UP after any of them is a recovery. DEGRADED has
 * to be in that set: a service can come back through a slow phase, so the real
 * sequence is DOWN -> DEGRADED -> UP. Were DEGRADED treated as healthy here,
 * that final UP would not qualify as a recovery, leaving the incident open
 * with no recovery notification ever sent.
 */
export function classifyStatusTransition(
  previousStatus: number | null,
  currentStatus: number,
): StatusTransition {
  const wasUnhealthy =
    previousStatus === HEARTBEAT_STATUS.DOWN ||
    previousStatus === HEARTBEAT_STATUS.MAINTENANCE ||
    previousStatus === HEARTBEAT_STATUS.DEGRADED;

  return {
    isDown: currentStatus === HEARTBEAT_STATUS.DOWN,
    isRecovery: wasUnhealthy && currentStatus === HEARTBEAT_STATUS.UP,
    isDegraded:
      currentStatus === HEARTBEAT_STATUS.DEGRADED &&
      previousStatus !== HEARTBEAT_STATUS.DEGRADED,
  };
}

/** Upper bound for the uptime streak so a bad interval cannot overflow INTEGER. */
export const MAX_CONSECUTIVE_UPTIME = 2_000_000_000;

function normalizeUptime(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_CONSECUTIVE_UPTIME, Math.max(0, Math.floor(value)));
}

/**
 * Advance the "currently up for N checks" streak.
 *
 * Only conclusive verdicts move the counter:
 * - UP increments it,
 * - DOWN resets it to zero,
 * - PENDING (no verdict yet), DEGRADED (up, but slowly) and MAINTENANCE
 *   (window suspended) leave it untouched, because none of them is evidence
 *   that the service is unhealthy. Resetting on maintenance would erase a
 *   long healthy streak every time planned work was scheduled.
 */
export function nextConsecutiveUptime(
  currentUptime: number,
  status: number,
): number {
  const current = normalizeUptime(currentUptime);

  if (status === HEARTBEAT_STATUS.UP) {
    return Math.min(current + 1, MAX_CONSECUTIVE_UPTIME);
  }
  if (status === HEARTBEAT_STATUS.DOWN) {
    return 0;
  }
  return current;
}

/**
 * Machine-readable failure reason derived from a check's message.
 *
 * `msg` is free text aimed at humans; this gives dashboards and alerting a
 * stable category to group and filter on without string-matching the message.
 *
 * Returns null when there is no failure to describe: a healthy check, a
 * degraded one (it succeeded, just slowly, so there is nothing to categorise
 * and "unknown" would flood the buckets alongside real failures), or a
 * maintenance window (the monitor is intentionally suspended). PENDING is
 * still classified because it means "failed, but inside the retry window".
 */
const NON_FAILURE_STATES: readonly number[] = [
  HEARTBEAT_STATUS.UP,
  HEARTBEAT_STATUS.MAINTENANCE,
  HEARTBEAT_STATUS.DEGRADED,
];

const ERROR_TYPE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["ssrf_blocked", /SSRF Blocked/i],
  ["timeout", /timed? ?out|Timeout after|execution deadline/i],
  ["too_many_redirects", /too many redirects/i],
  ["response_too_large", /response body exceeds/i],
  ["tls_error", /certificate|self[- ]signed|SSL|TLS|EPROTO/i],
  ["dns_failure", /ENOTFOUND|EAI_AGAIN|getaddrinfo|DNS resol/i],
  ["connection_refused", /ECONNREFUSED/i],
  ["connection_reset", /ECONNRESET|EPIPE|socket hang up/i],
  ["host_unreachable", /EHOSTUNREACH|ENETUNREACH|Host unreachable/i],
  ["misconfigured", /Missing (URL|hostname)|must be a local instance/i],
  ["unsupported_type", /unsupported monitor type/i],
];

export function classifyErrorType(
  msg: string | null,
  status: number,
): string | null {
  if (NON_FAILURE_STATES.includes(status)) return null;
  if (!msg) return "unknown";

  for (const [errorType, pattern] of ERROR_TYPE_PATTERNS) {
    if (pattern.test(msg)) return errorType;
  }
  return "unknown";
}
