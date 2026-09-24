import {
  HEARTBEAT_STATUS,
  determineEffectiveStatus,
  getCheckInterval,
} from "@/lib/monitor-status";

describe("getCheckInterval", () => {
  it("uses the normal interval for a healthy monitor", () => {
    expect(getCheckInterval(3600, 60, HEARTBEAT_STATUS.UP, 0)).toBe(3600);
  });

  it("uses the retry interval during the retry window", () => {
    expect(getCheckInterval(3600, 60, HEARTBEAT_STATUS.UP, 1)).toBe(60);
  });
});

describe("determineEffectiveStatus", () => {
  it("keeps the previous state during the retry window", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.UP,
        0,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.UP, downCount: 1 });
  });

  it("marks a first failure as pending when there is no previous state", () => {
    expect(determineEffectiveStatus(HEARTBEAT_STATUS.DOWN, null, 0, 1)).toEqual(
      { status: HEARTBEAT_STATUS.PENDING, downCount: 1 },
    );
  });

  it("marks down after the configured retry count", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.PENDING,
        1,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.DOWN, downCount: 2 });
  });

  it("resets the failure count on recovery", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.UP,
        HEARTBEAT_STATUS.DOWN,
        4,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.UP, downCount: 0 });
  });
});
