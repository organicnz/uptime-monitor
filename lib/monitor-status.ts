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
