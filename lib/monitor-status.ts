export const HEARTBEAT_STATUS = {
  DOWN: 0,
  UP: 1,
  PENDING: 2,
  MAINTENANCE: 3,
  DEGRADED: 4,
} as const;

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
      return { status: previousStatus ?? HEARTBEAT_STATUS.PENDING, downCount };
    }
    return { status: HEARTBEAT_STATUS.DOWN, downCount };
  }

  return { status: resultStatus, downCount: 0 };
}
