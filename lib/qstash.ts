import { Client } from "@upstash/qstash";

// QStash client singleton
let qstashClient: Client | null = null;

export function getQStashClient(): Client {
  if (!qstashClient) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      throw new Error("QSTASH_TOKEN environment variable is not set");
    }
    qstashClient = new Client({ token });
  }
  return qstashClient;
}

export type Schedule = {
  scheduleId: string;
  cron: string;
  destination: string;
  method: string;
  createdAt: number;
  isPaused: boolean;
  retries: number;
  callback?: string;
  failureCallback?: string;
  scheduleTimezone?: string;
};

export type ScheduleListResponse = Schedule[];

export type ScheduleConfig = {
  cron?: string;
  retries?: number;
  failureCallback?: string;
  scheduleTimezone?: string;
};

// Get all schedules
export async function listSchedules(): Promise<Schedule[]> {
  const client = getQStashClient();
  const schedules = await client.schedules.list();
  return schedules.map((s) => {
    const sched = s as Record<string, unknown>;
    return {
      scheduleId: s.scheduleId,
      cron: s.cron || "",
      destination: s.destination,
      method: s.method || "POST",
      createdAt: s.createdAt,
      isPaused: s.isPaused || false,
      retries: s.retries ?? 3,
      callback: s.callback,
      failureCallback: s.failureCallback,
      scheduleTimezone: (sched.scheduleTimezone as string) || undefined,
    };
  });
}

// Get a specific schedule
export async function getSchedule(
  scheduleId: string,
): Promise<Schedule | null> {
  const client = getQStashClient();
  try {
    const s = await client.schedules.get(scheduleId);
    const sched = s as Record<string, unknown>;
    return {
      scheduleId: s.scheduleId,
      cron: s.cron || "",
      destination: s.destination,
      method: s.method || "POST",
      createdAt: s.createdAt,
      isPaused: s.isPaused || false,
      retries: s.retries ?? 3,
      callback: s.callback,
      failureCallback: s.failureCallback,
      scheduleTimezone: (sched.scheduleTimezone as string) || undefined,
    };
  } catch {
    return null;
  }
}

// Create a new schedule
export async function createSchedule(params: {
  destination: string;
  cron: string;
}): Promise<{ scheduleId: string }> {
  const client = getQStashClient();
  const result = await client.schedules.create({
    destination: params.destination,
    cron: params.cron,
  });
  return { scheduleId: result.scheduleId };
}

// Update schedule (delete and recreate since QStash doesn't have direct update)
export async function updateSchedule(
  scheduleId: string,
  config: ScheduleConfig,
): Promise<{ scheduleId: string }> {
  const client = getQStashClient();

  // Get existing schedule
  const existing = await client.schedules.get(scheduleId);
  const existingSched = existing as Record<string, unknown>;

  // Delete old schedule
  await client.schedules.delete(scheduleId);

  // Build create options
  const createOptions: Record<string, unknown> = {
    destination: existing.destination,
    cron: config.cron || existing.cron || "* * * * *",
    retries: config.retries ?? existing.retries ?? 3,
    failureCallback: config.failureCallback || existing.failureCallback,
  };

  // Add timezone if provided
  const tz =
    config.scheduleTimezone || (existingSched.scheduleTimezone as string);
  if (tz) {
    createOptions.scheduleTimezone = tz;
  }

  // Create new schedule with updated config
  const result = await client.schedules.create(
    createOptions as Parameters<typeof client.schedules.create>[0],
  );

  return { scheduleId: result.scheduleId };
}

// Legacy function for backward compatibility
export async function updateScheduleCron(
  scheduleId: string,
  newCron: string,
): Promise<{ scheduleId: string }> {
  return updateSchedule(scheduleId, { cron: newCron });
}

// Delete a schedule
export async function deleteSchedule(scheduleId: string): Promise<void> {
  const client = getQStashClient();
  await client.schedules.delete(scheduleId);
}

// Pause a schedule
export async function pauseSchedule(scheduleId: string): Promise<void> {
  const client = getQStashClient();
  await client.schedules.pause({ schedule: scheduleId });
}

// Resume a schedule
export async function resumeSchedule(scheduleId: string): Promise<void> {
  const client = getQStashClient();
  await client.schedules.resume({ schedule: scheduleId });
}

// Helper to convert interval minutes to cron expression
export function intervalToCron(minutes: number): string {
  if (minutes < 1) return "* * * * *";
  if (minutes === 1) return "* * * * *";
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `0 */${hours} * * *`;
  return `0 0 * * *`; // Daily
}

// Helper to parse cron to approximate interval in minutes
export function cronToInterval(cron: string): number {
  const parts = cron.split(" ");
  if (parts.length !== 5) return 1;

  const [minute] = parts;

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/")) {
    return parseInt(minute.slice(2), 10) || 1;
  }

  // Every minute: * * * * *
  if (minute === "*") return 1;

  return 1;
}
