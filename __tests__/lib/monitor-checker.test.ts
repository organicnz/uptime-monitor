import {
  HEARTBEAT_STATUS,
  determineEffectiveStatus,
  getCheckInterval,
} from "@/lib/monitor-status";

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

  it("does not hold MAINTENANCE while a failure escalates", () => {
    // Maintenance is a window, not a health verdict. Holding it would mask a
    // real outage and flip straight to DOWN once the retry limit was passed.
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.MAINTENANCE,
        0,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.PENDING, downCount: 1 });
  });

  it("does not hold DEGRADED while a failure escalates", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.DEGRADED,
        0,
        2,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.PENDING, downCount: 1 });
  });

  it("still escalates to DOWN after the retry limit from maintenance", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.MAINTENANCE,
        1,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.DOWN, downCount: 2 });
  });

  it("holds DOWN through the retry window once already down", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.DOWN,
        1,
        3,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.DOWN, downCount: 2 });
  });

  it("recovers from maintenance to up and clears the failure count", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.UP,
        HEARTBEAT_STATUS.MAINTENANCE,
        2,
        3,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.UP, downCount: 0 });
  });

  it("treats a negative maxRetries as zero rather than trusting it", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.UP,
        0,
        -5,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.DOWN, downCount: 1 });
  });

  it("does not let a negative previousDownCount undercount the streak", () => {
    expect(
      determineEffectiveStatus(
        HEARTBEAT_STATUS.DOWN,
        HEARTBEAT_STATUS.UP,
        -3,
        1,
      ),
    ).toEqual({ status: HEARTBEAT_STATUS.UP, downCount: 1 });
  });
});

describe("getCheckInterval", () => {
  it("uses the retry interval while a failure streak is in progress", () => {
    expect(getCheckInterval(3600, 60, HEARTBEAT_STATUS.PENDING, 1)).toBe(60);
  });

  it("uses the normal interval once recovered", () => {
    expect(getCheckInterval(3600, 60, HEARTBEAT_STATUS.UP, 0)).toBe(3600);
  });
});
