import { z } from "zod";

import { notificationTypes } from "@/lib/notification-types";

/**
 * A typed, validated client for the app's own API routes.
 *
 * `response.json()` is typed `any`, and an `any` that arrived over the
 * network is where every type error in a client component starts: the
 * compiler says nothing, and the first sign of trouble is a `undefined`
 * three renders later. Validating at the boundary turns a change on the
 * server into an error the component already knows how to show.
 *
 * The schemas below are the API contract, written down in one place. A
 * route that stops matching one of them fails in the browser with a
 * message, instead of quietly handing the component a different shape.
 */

/** The body a route returns when it refuses a request. */
export const ApiErrorSchema = z.union([
  z.object({ error: z.string() }),
  // A route that reports the failure in the body *and* the status: the
  // notification test route does both.
  z.object({ success: z.literal(false), error: z.string() }),
]);

/** An error from an API route, carrying the route's own message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Fetch JSON and validate it against a schema.
 *
 * A non-2xx response throws, with the route's own message when it sent
 * one. A 2xx response that does not match the schema throws too: a shape
 * the component was not written for is a bug, and it should say so
 * instead of reading `undefined` off it.
 */
export async function fetchJson<T>(
  input: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const failure = ApiErrorSchema.safeParse(body);
    throw new ApiError(
      response.status,
      failure.success
        ? failure.data.error
        : `Request failed with status ${response.status}`,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, `Unexpected response from ${input}`);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// The responses the browser reads.
// ---------------------------------------------------------------------------

/** The monitor check schedule, as `/api/settings/schedule` returns it. */
export const ScheduleSchema = z.object({
  id: z.string(),
  cron: z.string(),
  intervalMinutes: z.number(),
  destination: z.string(),
  isPaused: z.boolean(),
  createdAt: z.number(),
  retries: z.number(),
  failureCallback: z.string().optional(),
  timezone: z.string().optional(),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

/** `GET /api/settings/schedule` */
export const ScheduleResponseSchema = z.object({
  schedule: ScheduleSchema.nullable(),
  message: z.string().optional(),
});

/** `PATCH /api/settings/schedule` */
export const ScheduleUpdateResponseSchema = z.object({
  success: z.literal(true),
  action: z.string().optional(),
  newScheduleId: z.string().optional(),
  cron: z.string().optional(),
  retries: z.number().optional(),
  failureCallback: z.string().optional(),
  intervalMinutes: z.number().optional(),
});

/** `POST /api/notifications/test` */
export const NotificationTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
  transport: z.string().optional(),
});

/** A notification channel, as the routes return it. */
export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The same list the senders use, so the browser and the edge function
  // cannot disagree about which channel types exist.
  type: z.enum(notificationTypes),
  config: z.record(z.string(), z.unknown()),
  active: z.boolean(),
  is_default: z.boolean(),
  has_secret: z.boolean(),
});

/** `POST` and `PATCH /api/notifications/channels` */
export const ChannelResponseSchema = z.object({
  success: z.literal(true),
  channel: ChannelSchema,
});

/** `GET /api/notifications/channels?id=...` */
export const ChannelViewResponseSchema = z.object({
  channel: ChannelSchema,
});

/** `DELETE /api/notifications/channels` */
export const ChannelDeleteResponseSchema = z.object({
  success: z.literal(true),
});

/** `POST /api/monitors/[id]/check` */
export const MonitorCheckResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  monitorId: z.string(),
  timestamp: z.string(),
});
