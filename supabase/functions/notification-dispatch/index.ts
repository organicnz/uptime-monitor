/**
 * notification-dispatch
 *
 * Sends a notification for a saved channel without the channel credential ever
 * entering the Next.js runtime: the function authenticates with a secret from
 * its own secret store (`supabase secrets set`, provisioned by
 * .github/workflows/supabase-migrations.yml), then reads the credential from
 * Supabase Vault through the `notification_channel_secrets` RPC.
 *
 * Request:  { "channel_id": "<uuid>", "payload": { ...NotificationPayload } }
 * Auth:     x-dispatch-secret: <NOTIFICATION_DISPATCH_SECRET>
 *
 * The message formats live in ../_shared/senders.ts, which the Next.js runtime
 * imports too, so the two paths cannot drift.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  sendNotification,
  withRetry,
  type NotificationPayload,
  type NotificationType,
  type SendResult,
} from "../_shared/senders.ts";
import { createSsrfProtectedTransport } from "../_shared/egress.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TYPES = new Set<NotificationType>([
  "email",
  "discord",
  "slack",
  "webhook",
  "telegram",
  "pushover",
  "teams",
]);

/** Fixed-vendor endpoints: host is part of the integration, not user input. */
const directSender = withRetry((url, init) => fetch(url, init));
const ssrfSender = withRetry(createSsrfProtectedTransport());

function senderFor(type: NotificationType) {
  return type === "telegram" || type === "pushover" ? directSender : ssrfSender;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Constant-time compare so a wrong secret cannot be probed by timing. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

type ChannelRow = {
  id: string;
  user_id: string;
  type: NotificationType;
  config: Record<string, unknown>;
  secret_id: string | null;
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("NOTIFICATION_DISPATCH_SECRET");
  if (!expectedSecret) {
    console.error(
      "[notification-dispatch] NOTIFICATION_DISPATCH_SECRET is not set in the function secret store",
    );
    return json(
      { success: false, error: "Dispatch secret is not configured" },
      503,
    );
  }

  const providedSecret = request.headers.get("x-dispatch-secret") ?? "";
  if (!secretsMatch(providedSecret, expectedSecret)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[notification-dispatch] Supabase function secrets missing");
    return json(
      { success: false, error: "Function secrets are not configured" },
      503,
    );
  }

  let body: { channel_id?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const channelId = typeof body.channel_id === "string" ? body.channel_id : "";
  if (!UUID_RE.test(channelId)) {
    return json({ success: false, error: "Invalid channel ID" }, 400);
  }

  if (!body.payload || typeof body.payload !== "object") {
    return json({ success: false, error: "Invalid payload" }, 400);
  }
  const payload = body.payload as NotificationPayload;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: channel, error: channelError } = await supabase
    .from("notification_channels")
    .select("id, user_id, type, config, secret_id")
    .eq("id", channelId)
    .maybeSingle<ChannelRow>();

  if (channelError || !channel) {
    return json({ success: false, error: "Channel not found" }, 404);
  }

  if (!VALID_TYPES.has(channel.type)) {
    return json(
      { success: false, error: `Unknown notification type: ${channel.type}` },
      400,
    );
  }

  if (channel.secret_id === null) {
    return json(
      { success: false, error: "Channel has no stored credentials" },
      409,
    );
  }

  // service_role is the only role allowed through this RPC.
  const { data: secrets, error: secretError } = await supabase.rpc(
    "notification_channel_secrets",
    { p_channel_ids: [channelId] },
  );

  if (secretError) {
    console.error("[notification-dispatch] vault read failed:", secretError);
    return json(
      { success: false, error: "Failed to read stored credentials" },
      500,
    );
  }

  const secret = ((secrets as { out_secret: Record<string, unknown> }[])?.[0]
    ?.out_secret ?? null) as Record<string, unknown> | null;

  if (!secret) {
    return json(
      { success: false, error: "No stored credentials for channel" },
      409,
    );
  }

  const config = { ...(channel.config ?? {}), ...secret };

  const result: SendResult = await sendNotification(
    channel.type,
    config,
    payload,
    senderFor(channel.type),
  );

  if (!result.success) {
    console.error(
      `[notification-dispatch] ${channel.type} send failed: ${result.error}`,
    );
    return json({ success: false, error: result.error }, 502);
  }

  return json({ success: true, transport: "edge" });
});
