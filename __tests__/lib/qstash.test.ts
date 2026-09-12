import { cronToInterval, cronToTimezone, intervalToCron } from "@/lib/qstash";

describe("intervalToCron", () => {
  it("maps sub-minute and one-minute intervals to every minute", () => {
    expect(intervalToCron(0)).toBe("* * * * *");
    expect(intervalToCron(1)).toBe("* * * * *");
  });

  it("maps sub-hourly intervals to step values", () => {
    expect(intervalToCron(5)).toBe("*/5 * * * *");
    expect(intervalToCron(15)).toBe("*/15 * * * *");
    expect(intervalToCron(30)).toBe("*/30 * * * *");
  });

  it("maps hourly intervals to hour steps", () => {
    expect(intervalToCron(60)).toBe("0 */1 * * *");
    expect(intervalToCron(120)).toBe("0 */2 * * *");
    expect(intervalToCron(720)).toBe("0 */12 * * *");
  });

  it("maps day-or-longer intervals to daily", () => {
    expect(intervalToCron(1440)).toBe("0 0 * * *");
    expect(intervalToCron(10080)).toBe("0 0 * * *");
  });

  it("prefixes non-UTC timezones and omits UTC", () => {
    expect(intervalToCron(5, "America/New_York")).toBe(
      "CRON_TZ=America/New_York */5 * * * *",
    );
    expect(intervalToCron(5, "UTC")).toBe("*/5 * * * *");
    expect(intervalToCron(5)).toBe("*/5 * * * *");
  });
});

describe("cronToInterval", () => {
  it("parses step and every-minute expressions", () => {
    expect(cronToInterval("*/5 * * * *")).toBe(5);
    expect(cronToInterval("*/15 * * * *")).toBe(15);
    expect(cronToInterval("* * * * *")).toBe(1);
  });

  it("strips the timezone prefix before parsing", () => {
    expect(cronToInterval("CRON_TZ=America/New_York */15 * * * *")).toBe(15);
  });

  it("falls back to 1 for shapes it does not model", () => {
    expect(cronToInterval("0 */2 * * *")).toBe(1);
    expect(cronToInterval("0 0 * * *")).toBe(1);
    expect(cronToInterval("bogus")).toBe(1);
  });
});

describe("cronToTimezone", () => {
  it("extracts the timezone from a prefixed expression", () => {
    expect(cronToTimezone("CRON_TZ=America/New_York */5 * * * *")).toBe(
      "America/New_York",
    );
  });

  it("defaults to UTC without a prefix", () => {
    expect(cronToTimezone("*/5 * * * *")).toBe("UTC");
    expect(cronToTimezone("* * * * *")).toBe("UTC");
  });
});
