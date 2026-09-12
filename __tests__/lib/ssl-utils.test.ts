import {
  SSL_DAYS_REMAINING_UNKNOWN,
  formatSslInfo,
  getSslDaysRemaining,
  getSslExpiryStatus,
  shouldWarnSslExpiry,
  type SslInfo,
} from "@/lib/ssl-utils";

const DAY_MS = 1000 * 60 * 60 * 24;

describe("getSslDaysRemaining", () => {
  it("returns whole days for a future Date", () => {
    const expiry = new Date(Date.now() + 10 * DAY_MS + 60_000);
    expect(getSslDaysRemaining(expiry)).toBe(10);
  });

  it("accepts an ISO string", () => {
    const expiry = new Date(Date.now() + 30 * DAY_MS + 60_000).toISOString();
    expect(getSslDaysRemaining(expiry)).toBe(30);
  });

  it("returns negative days for an expired certificate", () => {
    const expiry = new Date(Date.now() - 5 * DAY_MS);
    expect(getSslDaysRemaining(expiry)).toBe(-5);
  });
});

describe("getSslExpiryStatus", () => {
  it("maps the unknown sentinel", () => {
    expect(getSslExpiryStatus(SSL_DAYS_REMAINING_UNKNOWN)).toEqual({
      status: "unknown",
      label: "Unknown",
      color: "gray",
    });
  });

  it("maps negative days to expired", () => {
    expect(getSslExpiryStatus(-3)).toEqual({
      status: "expired",
      label: "Expired",
      color: "red",
    });
  });

  it("maps positive days to ok with a countdown label", () => {
    expect(getSslExpiryStatus(45)).toEqual({
      status: "ok",
      label: "45d remaining",
      color: "green",
    });
  });

  it("stays ok inside the warning window (deliberate: warn on expiry only)", () => {
    expect(getSslExpiryStatus(5).status).toBe("ok");
  });
});

describe("shouldWarnSslExpiry", () => {
  it("never warns for unknown expiry", () => {
    expect(shouldWarnSslExpiry(SSL_DAYS_REMAINING_UNKNOWN)).toBe(false);
    expect(shouldWarnSslExpiry(SSL_DAYS_REMAINING_UNKNOWN, -5)).toBe(false);
  });

  it("warns on first observed expiration", () => {
    expect(shouldWarnSslExpiry(-2)).toBe(true);
    expect(shouldWarnSslExpiry(-2, undefined)).toBe(true);
  });

  it("warns when crossing from valid to expired", () => {
    expect(shouldWarnSslExpiry(-1, 30)).toBe(true);
    expect(shouldWarnSslExpiry(-1, 0)).toBe(true);
  });

  it("does not re-warn once expiration was already reported", () => {
    expect(shouldWarnSslExpiry(-2, -1)).toBe(false);
  });

  it("never warns for valid certificates", () => {
    expect(shouldWarnSslExpiry(30)).toBe(false);
    expect(shouldWarnSslExpiry(30, undefined)).toBe(false);
    expect(shouldWarnSslExpiry(0)).toBe(false);
  });
});

describe("formatSslInfo", () => {
  const info: SslInfo = {
    issuer: "Test CA",
    validFrom: "2025-01-01",
    validTo: "2026-01-01",
    daysRemaining: 100,
    isValid: true,
    subject: "example.com",
  };

  it("formats all fields line by line", () => {
    expect(formatSslInfo(info)).toBe(
      [
        "Subject: example.com",
        "Issuer: Test CA",
        "Valid From: 2025-01-01",
        "Valid To: 2026-01-01",
        "Days Remaining: 100",
      ].join("\n"),
    );
  });

  it("renders unknown expiry as Unknown", () => {
    expect(
      formatSslInfo({ ...info, daysRemaining: SSL_DAYS_REMAINING_UNKNOWN }),
    ).toContain("Days Remaining: Unknown");
  });
});
