import {
  HEARTBEAT_STATUS,
  MAX_CONSECUTIVE_UPTIME,
  classifyErrorType,
  determineEffectiveStatus,
  getCheckInterval,
  nextConsecutiveUptime,
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

describe("nextConsecutiveUptime", () => {
  it("increments while the monitor is up", () => {
    expect(nextConsecutiveUptime(0, HEARTBEAT_STATUS.UP)).toBe(1);
    expect(nextConsecutiveUptime(41, HEARTBEAT_STATUS.UP)).toBe(42);
  });

  it("resets to zero when the monitor goes down", () => {
    expect(nextConsecutiveUptime(500, HEARTBEAT_STATUS.DOWN)).toBe(0);
  });

  it("suspends the streak during maintenance instead of ending it", () => {
    // Planned work must not erase a long healthy streak.
    expect(nextConsecutiveUptime(500, HEARTBEAT_STATUS.MAINTENANCE)).toBe(500);
  });

  it("leaves the streak alone while pending (no verdict yet)", () => {
    expect(nextConsecutiveUptime(7, HEARTBEAT_STATUS.PENDING)).toBe(7);
  });

  it("survives a full up -> maintenance -> up cycle", () => {
    const first = nextConsecutiveUptime(10, HEARTBEAT_STATUS.UP);
    const held = nextConsecutiveUptime(first, HEARTBEAT_STATUS.MAINTENANCE);
    const resumed = nextConsecutiveUptime(held, HEARTBEAT_STATUS.UP);

    expect(resumed).toBe(12);
  });

  it("normalizes negative and non-finite input", () => {
    expect(nextConsecutiveUptime(-5, HEARTBEAT_STATUS.UP)).toBe(1);
    // A corrupt stored value is treated as "unknown" and restarted rather than
    // saturated, which would display an absurd streak.
    expect(nextConsecutiveUptime(Number.NaN, HEARTBEAT_STATUS.UP)).toBe(1);
    expect(
      nextConsecutiveUptime(Number.POSITIVE_INFINITY, HEARTBEAT_STATUS.UP),
    ).toBe(1);
    expect(
      nextConsecutiveUptime(
        Number.POSITIVE_INFINITY,
        HEARTBEAT_STATUS.MAINTENANCE,
      ),
    ).toBe(0);
  });

  it("clamps at the upper bound so a bad interval cannot overflow INTEGER", () => {
    expect(
      nextConsecutiveUptime(MAX_CONSECUTIVE_UPTIME, HEARTBEAT_STATUS.UP),
    ).toBe(MAX_CONSECUTIVE_UPTIME);
  });
});

describe("classifyErrorType", () => {
  it("returns null for a healthy check", () => {
    expect(classifyErrorType("200 - OK", HEARTBEAT_STATUS.UP)).toBeNull();
  });

  it("classifies SSRF rejections ahead of other patterns", () => {
    expect(
      classifyErrorType(
        "SSRF Blocked: Target IP is blocked",
        HEARTBEAT_STATUS.DOWN,
      ),
    ).toBe("ssrf_blocked");
  });

  it("classifies timeouts and deadline overruns", () => {
    expect(classifyErrorType("Timeout after 30s", HEARTBEAT_STATUS.DOWN)).toBe(
      "timeout",
    );
    expect(
      classifyErrorType("Execution deadline exceeded", HEARTBEAT_STATUS.DOWN),
    ).toBe("timeout");
  });

  it("classifies transport-level failures", () => {
    expect(
      classifyErrorType(
        "connect ECONNREFUSED 127.0.0.1:443",
        HEARTBEAT_STATUS.DOWN,
      ),
    ).toBe("connection_refused");
    expect(classifyErrorType("read ECONNRESET", HEARTBEAT_STATUS.DOWN)).toBe(
      "connection_reset",
    );
    expect(
      classifyErrorType("EAI_AGAIN example.com", HEARTBEAT_STATUS.DOWN),
    ).toBe("dns_failure");
    expect(
      classifyErrorType("DNS Resolution failed: boom", HEARTBEAT_STATUS.DOWN),
    ).toBe("dns_failure");
  });

  it("classifies TLS and certificate problems", () => {
    expect(
      classifyErrorType(
        "unable to verify the first certificate",
        HEARTBEAT_STATUS.DOWN,
      ),
    ).toBe("tls_error");
  });

  it("classifies configuration mistakes", () => {
    expect(classifyErrorType("Missing URL", HEARTBEAT_STATUS.DOWN)).toBe(
      "misconfigured",
    );
    expect(
      classifyErrorType(
        "Unsupported monitor type: steam",
        HEARTBEAT_STATUS.DOWN,
      ),
    ).toBe("unsupported_type");
  });

  it("classifies response-size and redirect guards", () => {
    expect(
      classifyErrorType(
        "Response body exceeds the 1 MiB limit",
        HEARTBEAT_STATUS.DOWN,
      ),
    ).toBe("response_too_large");
    expect(classifyErrorType("Too many redirects", HEARTBEAT_STATUS.DOWN)).toBe(
      "too_many_redirects",
    );
  });

  it("falls back to unknown for unrecognised messages", () => {
    expect(
      classifyErrorType("something novel broke", HEARTBEAT_STATUS.DOWN),
    ).toBe("unknown");
  });

  it("handles a missing message on a failure", () => {
    expect(classifyErrorType(null, HEARTBEAT_STATUS.DOWN)).toBe("unknown");
  });

  it("records no error category for a maintenance heartbeat", () => {
    // Maintenance is intentional, so it must not surface as a failure
    // category and pollute error_type.
    expect(
      classifyErrorType("Under maintenance", HEARTBEAT_STATUS.MAINTENANCE),
    ).toBeNull();
  });

  it("still classifies a failure that is inside the retry window", () => {
    // PENDING means "failed but not yet past the retry threshold", which is
    // still a real failure worth categorising.
    expect(
      classifyErrorType("Timeout after 30s", HEARTBEAT_STATUS.PENDING),
    ).toBe("timeout");
  });
});
