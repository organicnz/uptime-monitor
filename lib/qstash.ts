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
};

export type ScheduleListResponse = Schedule[];

// Get all schedules
export async function listSchedules(): Promise<Schedule[]> {
  const client = getQStashClient();
  const schedules = await client.schedules.list();
  return schedules.map((s) => ({
    scheduleId: s.scheduleId,
    cron: s.cron || "",
    destination: s.destination,
    method: s.method || "POST",
    createdAt: s.createdAt,
    isPaused: s.isPaused || false,
  }));
}

// Get a specific schedule
export async function getSchedule(
  scheduleId: string,
): Promise<Schedule | null> {
  const client = getQStashClient();
  try {
    const s = await client.schedules.get(scheduleId);
    return {
      scheduleId: s.scheduleId,
      cron: s.cron || "",
      destination: s.destination,
      method: s.method || "POST",
      createdAt: s.createdAt,
      isPaused: s.isPaused || false,
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

// Update schedule (delete and recreate since QStash doesn't have update)
export async function updateScheduleCron(
  scheduleId: string,
  newCron: string,
): Promise<{ scheduleId: string }> {
  const client = getQStashClient();

  // Get existing schedule
  const existing = await client.schedules.get(scheduleId);

  // Delete old schedule
  await client.schedules.delete(scheduleId);

  // Create new schedule with updated cron
  const result = await client.schedules.create({
    destination: existing.destination,
    cron: newCron,
  });

  return { scheduleId: result.scheduleId };
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
