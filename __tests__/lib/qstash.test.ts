import type { Mock } from "bun:test";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@upstash/qstash", () => {
  const api = {
    list: mock(async () => []),
    get: mock(async () => ({})),
    create: mock(async () => ({ scheduleId: "created" })),
    delete: mock(async () => undefined),
    pause: mock(async () => undefined),
    resume: mock(async () => undefined),
  };
  return {
    Client: class {
      schedules = api;
    },
  };
});

import {
  createSchedule,
  cronToInterval,
  cronToTimezone,
  deleteSchedule,
  getQStashClient,
  getSchedule,
  intervalToCron,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
  updateScheduleCron,
} from "@/lib/qstash";

type SchedulesMock = {
  list: Mock<() => Promise<unknown[]>>;
  get: Mock<(...args: unknown[]) => Promise<Record<string, unknown>>>;
  create: Mock<(...args: unknown[]) => Promise<{ scheduleId: string }>>;
  delete: Mock<(...args: unknown[]) => Promise<void>>;
  pause: Mock<(...args: unknown[]) => Promise<void>>;
  resume: Mock<(...args: unknown[]) => Promise<void>>;
};

// Reading the mocked module back with import() is unreliable, so reach the
// mocked schedules API through the client's singleton instead.
function schedulesApi(): SchedulesMock {
  return (getQStashClient() as unknown as { schedules: SchedulesMock })
    .schedules;
}

// bun test auto-loads .env.local, so QStash vars may already be set.
const savedEnv = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined) {
  if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

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

  it("defaults to UTC for a prefix without an expression", () => {
    expect(cronToTimezone("CRON_TZ=")).toBe("UTC");
  });
});

describe("schedule API", () => {
  beforeEach(() => {
    setEnv("QSTASH_TOKEN", "token");
    setEnv("QSTASH_CURRENT_SIGNING_KEY", "current");
    setEnv("QSTASH_NEXT_SIGNING_KEY", "next");
    setEnv("VERCEL_AUTOMATION_BYPASS_SECRET", undefined);
    schedulesApi().list.mockReset();
    schedulesApi().get.mockReset();
    schedulesApi().create.mockReset();
    schedulesApi().delete.mockReset();
    schedulesApi().pause.mockReset();
    schedulesApi().resume.mockReset();
  });

  describe("listSchedules", () => {
    it("maps raw schedules and fills defaults", async () => {
      schedulesApi().list.mockResolvedValue([
        {
          scheduleId: "minimal",
          destination: "https://example.com/cron",
          createdAt: 1,
        },
        {
          scheduleId: "full",
          cron: "*/5 * * * *",
          destination: "https://example.com/cron",
          method: "GET",
          createdAt: 2,
          isPaused: true,
          retries: 5,
          callback: "https://example.com/cb",
          failureCallback: "https://example.com/fb",
          scheduleTimezone: "America/New_York",
        },
      ]);

      const schedules = await listSchedules();

      expect(schedules).toEqual([
        {
          scheduleId: "minimal",
          cron: "",
          destination: "https://example.com/cron",
          method: "POST",
          createdAt: 1,
          isPaused: false,
          retries: 3,
          callback: undefined,
          failureCallback: undefined,
          scheduleTimezone: undefined,
        },
        {
          scheduleId: "full",
          cron: "*/5 * * * *",
          destination: "https://example.com/cron",
          method: "GET",
          createdAt: 2,
          isPaused: true,
          retries: 5,
          callback: "https://example.com/cb",
          failureCallback: "https://example.com/fb",
          scheduleTimezone: "America/New_York",
        },
      ]);
    });
  });

  describe("getSchedule", () => {
    it("maps the fetched schedule", async () => {
      schedulesApi().get.mockResolvedValue({
        scheduleId: "s1",
        cron: "*/15 * * * *",
        destination: "https://example.com/cron",
        createdAt: 3,
        scheduleTimezone: "Europe/London",
      });

      const schedule = await getSchedule("s1");

      expect(schedule).toEqual({
        scheduleId: "s1",
        cron: "*/15 * * * *",
        destination: "https://example.com/cron",
        method: "POST",
        createdAt: 3,
        isPaused: false,
        retries: 3,
        callback: undefined,
        failureCallback: undefined,
        scheduleTimezone: "Europe/London",
      });
    });

    it("returns null when the fetch fails", async () => {
      schedulesApi().get.mockRejectedValue(new Error("not found"));
      await expect(getSchedule("missing")).resolves.toBeNull();
    });
  });

  describe("createSchedule", () => {
    it("omits headers when no bypass secret is set", async () => {
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });

      const result = await createSchedule({
        destination: "https://example.com/cron",
        cron: "*/5 * * * *",
        failureCallback: "https://example.com/fb",
      });

      expect(result).toEqual({ scheduleId: "new" });
      expect(schedulesApi().create).toHaveBeenCalledWith({
        destination: "https://example.com/cron",
        cron: "*/5 * * * *",
        failureCallback: "https://example.com/fb",
        headers: undefined,
      });
    });

    it("adds the Vercel protection bypass header when configured", async () => {
      setEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass-secret");
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });

      await createSchedule({
        destination: "https://example.com/cron",
        cron: "*/5 * * * *",
      });

      expect(schedulesApi().create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { "x-vercel-protection-bypass": "bypass-secret" },
        }),
      );
    });
  });

  describe("updateSchedule", () => {
    const existing = {
      scheduleId: "old",
      cron: "*/5 * * * *",
      destination: "https://example.com/cron",
      method: "POST",
      createdAt: 1,
      isPaused: false,
      retries: 3,
      failureCallback: "https://example.com/fb",
      scheduleTimezone: "America/New_York",
    };

    it("recreates with merged config, then deletes the old schedule", async () => {
      schedulesApi().get.mockResolvedValue(existing);
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });
      schedulesApi().delete.mockResolvedValue(undefined);

      const result = await updateSchedule("old", { cron: "*/10 * * * *" });

      expect(result).toEqual({ scheduleId: "new" });
      expect(schedulesApi().create).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: "https://example.com/cron",
          cron: "*/10 * * * *",
          retries: 3,
          failureCallback: "https://example.com/fb",
          scheduleTimezone: "America/New_York",
          headers: undefined,
        }),
      );
      expect(schedulesApi().delete).toHaveBeenCalledWith("old");
    });

    it("lets explicit config win over the existing schedule", async () => {
      schedulesApi().get.mockResolvedValue(existing);
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });
      schedulesApi().delete.mockResolvedValue(undefined);

      await updateSchedule("old", {
        cron: "*/30 * * * *",
        retries: 7,
        failureCallback: "https://example.com/other-fb",
        scheduleTimezone: "UTC",
      });

      expect(schedulesApi().create).toHaveBeenCalledWith(
        expect.objectContaining({
          cron: "*/30 * * * *",
          retries: 7,
          failureCallback: "https://example.com/other-fb",
          scheduleTimezone: "UTC",
        }),
      );
    });

    it("deletes the replacement when removing the old schedule fails", async () => {
      schedulesApi().get.mockResolvedValue(existing);
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });
      schedulesApi()
        .delete.mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue(undefined);

      await expect(
        updateSchedule("old", { cron: "*/10 * * * *" }),
      ).rejects.toThrow("boom");

      expect(schedulesApi().delete).toHaveBeenNthCalledWith(1, "old");
      expect(schedulesApi().delete).toHaveBeenNthCalledWith(2, "new");
    });
  });

  describe("updateScheduleCron", () => {
    it("recreates the schedule with only the cron changed", async () => {
      schedulesApi().get.mockResolvedValue({
        scheduleId: "old",
        cron: "*/5 * * * *",
        destination: "https://example.com/cron",
        createdAt: 1,
      });
      schedulesApi().create.mockResolvedValue({ scheduleId: "new" });
      schedulesApi().delete.mockResolvedValue(undefined);

      const result = await updateScheduleCron("old", "*/20 * * * *");

      expect(result).toEqual({ scheduleId: "new" });
      expect(schedulesApi().create).toHaveBeenCalledWith(
        expect.objectContaining({ cron: "*/20 * * * *" }),
      );
    });
  });

  describe("delete/pause/resume", () => {
    it("forwards to the client", async () => {
      schedulesApi().delete.mockResolvedValue(undefined);
      schedulesApi().pause.mockResolvedValue(undefined);
      schedulesApi().resume.mockResolvedValue(undefined);

      await deleteSchedule("s1");
      await pauseSchedule("s2");
      await resumeSchedule("s3");

      expect(schedulesApi().delete).toHaveBeenCalledWith("s1");
      expect(schedulesApi().pause).toHaveBeenCalledWith({ schedule: "s2" });
      expect(schedulesApi().resume).toHaveBeenCalledWith({ schedule: "s3" });
    });
  });
});
