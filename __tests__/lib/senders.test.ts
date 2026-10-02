import { describe, expect, it } from "bun:test";
import {
  MAX_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  sendNotification,
  withRetry,
  type NotificationPayload,
  type NotificationTransport,
} from "../../supabase/functions/_shared/senders";

const payload: NotificationPayload = {
  title: "Monitor down",
  message: "The service is unreachable",
  monitorName: "API",
  monitorUrl: "https://api.example.com",
  status: "down",
  timestamp: "2026-09-27T09:00:00.000Z",
};

type Call = { url: string; init: RequestInit };

/** Transport that replays a scripted sequence of responses. */
function scripted(responses: Array<Response | Error>): {
  send: NotificationTransport;
  calls: Call[];
} {
  const calls: Call[] = [];
  let index = 0;
  const send: NotificationTransport = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next.clone();
  };
  return { send, calls };
}

/** Transport that records a single successful call and echoes its body. */
function recorder(): {
  send: NotificationTransport;
  calls: Call[];
  body: () => unknown;
} {
  const calls: Call[] = [];
  const send: NotificationTransport = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true, status: 1 }), {
      status: 200,
    });
  };
  const body = () => {
    const raw = calls[0]?.init.body;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  };
  return { send, calls, body };
}

/** `retry-after: 0` keeps retry tests from sleeping on real timers. */
function okWithRetryAfter(): Response {
  return new Response("{}", {
    status: 503,
    headers: { "retry-after": "0" },
  });
}

describe("withRetry", () => {
  it("returns a successful response without retrying", async () => {
    const { send, calls } = scripted([new Response("{}", { status: 200 })]);
    const wrapped = withRetry(send);
    const response = await wrapped("https://example.com", { method: "POST" });
    expect(response.status).toBe(200);
    expect(calls.length).toBe(1);
  });

  it("retries a retryable status until it succeeds", async () => {
    const { send, calls } = scripted([
      okWithRetryAfter(),
      okWithRetryAfter(),
      new Response("{}", { status: 200 }),
    ]);
    const wrapped = withRetry(send);
    const response = await wrapped("https://example.com", {});
    expect(response.status).toBe(200);
    expect(calls.length).toBe(3);
  });

  it("does not retry a non-retryable status", async () => {
    const { send, calls } = scripted([new Response("nope", { status: 400 })]);
    const wrapped = withRetry(send);
    const response = await wrapped("https://example.com", {});
    expect(response.status).toBe(400);
    expect(calls.length).toBe(1);
  });

  it("gives up after MAX_ATTEMPTS on a persistent failure", async () => {
    const { send, calls } = scripted([okWithRetryAfter()]);
    const wrapped = withRetry(send);
    const response = await wrapped("https://example.com", {});
    expect(response.status).toBe(503);
    expect(calls.length).toBe(MAX_ATTEMPTS);
  });

  it("retries network errors and eventually throws", async () => {
    const { send, calls } = scripted([new Error("ECONNRESET")]);
    const wrapped = withRetry(send, { maxAttempts: 2 });
    await expect(wrapped("https://example.com", {})).rejects.toThrow(
      "ECONNRESET",
    );
    expect(calls.length).toBe(2);
  });

  it("recovers when a network error is followed by success", async () => {
    const { send, calls } = scripted([
      new Error("ECONNRESET"),
      new Response("{}", { status: 200 }),
    ]);
    const wrapped = withRetry(send, { maxAttempts: 2 });
    const response = await wrapped("https://example.com", {});
    expect(response.status).toBe(200);
    expect(calls.length).toBe(2);
  });

  it("aborts a request that exceeds the timeout", async () => {
    const hanging: NotificationTransport = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    const wrapped = withRetry(hanging, { maxAttempts: 1, timeoutMs: 30 });
    await expect(wrapped("https://example.com", {})).rejects.toThrow();
  });

  it("uses documented defaults", () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(REQUEST_TIMEOUT_MS).toBe(2000);
  });
});

describe("sendNotification", () => {
  it("posts to the Telegram bot API and honours ok:false", async () => {
    const { send, calls, body } = recorder();
    const result = await sendNotification(
      "telegram",
      { bot_token: "token123", chat_id: "42" },
      payload,
      send,
    );
    expect(result.success).toBe(true);
    expect(calls[0].url).toBe(
      "https://api.telegram.org/bottoken123/sendMessage",
    );
    const parsed = body() as { chat_id: string; text: string };
    expect(parsed.chat_id).toBe("42");
    expect(parsed.text).toContain("Monitor down");
    expect(parsed.text).toContain("API");

    const failing = scripted([
      new Response(
        JSON.stringify({ ok: false, description: "chat not found" }),
        {
          status: 400,
        },
      ),
    ]);
    const failed = await sendNotification(
      "telegram",
      { bot_token: "t", chat_id: "42" },
      payload,
      failing.send,
    );
    expect(failed.success).toBe(false);
    expect(failed.error).toBe("chat not found");
  });

  it("escapes Markdown metacharacters in Telegram text", async () => {
    const { send, body } = recorder();
    await sendNotification(
      "telegram",
      { bot_token: "t", chat_id: "1" },
      { title: "a_b*c[d]", message: "x(y)" },
      send,
    );
    const parsed = body() as { text: string };
    expect(parsed.text).toContain("a\\_b\\*c\\[d\\]");
    expect(parsed.text).toContain("x\\(y\\)");
  });

  it("sends a Discord embed coloured by status", async () => {
    for (const [status, color] of [
      ["up", 0x00ff00],
      ["down", 0xff0000],
      ["degraded", 0xffff00],
    ] as const) {
      const { calls, body } = recorder();
      const result = await sendNotification(
        "discord",
        { webhook_url: "https://discord.example/hook" },
        { ...payload, status },
        async (url, init) => {
          calls.push({ url, init });
          return new Response(null, { status: 204 });
        },
      );
      expect(result.success).toBe(true);
      expect(calls[0].url).toBe("https://discord.example/hook");
      const parsed = body() as { embeds: Array<{ color: number }> };
      expect(parsed.embeds[0].color).toBe(color);
    }
  });

  it("reports a non-2xx Discord response as failure", async () => {
    const { send } = scripted([new Response("bad", { status: 404 })]);
    const result = await sendNotification(
      "discord",
      { webhook_url: "https://discord.example/hook" },
      payload,
      send,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("404");
  });

  it("sends a Slack attachment coloured by status", async () => {
    const { calls, body } = recorder();
    await sendNotification(
      "slack",
      { webhook_url: "https://slack.example/hook" },
      { ...payload, status: "down" },
      async (url, init) => {
        calls.push({ url, init });
        return new Response("ok", { status: 200 });
      },
    );
    const parsed = body() as { attachments: Array<{ color: string }> };
    expect(parsed.attachments[0].color).toBe("danger");
  });

  it("sends a Teams MessageCard", async () => {
    const { calls, body } = recorder();
    await sendNotification(
      "teams",
      { webhook_url: "https://teams.example/hook" },
      { ...payload, status: "up" },
      async (url, init) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      },
    );
    const parsed = body() as { "@type": string; themeColor: string };
    expect(parsed["@type"]).toBe("MessageCard");
    expect(parsed.themeColor).toBe("00FF00");
  });

  it("sends Pushover as form data with the `token` field", async () => {
    const calls: Call[] = [];
    const send: NotificationTransport = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: 1 }), { status: 200 });
    };
    const result = await sendNotification(
      "pushover",
      { user_key: "user-key", token: "app-token", priority: 1 },
      payload,
      send,
    );
    expect(result.success).toBe(true);
    expect(calls[0].url).toBe("https://api.pushover.net/1/messages.json");
    const form = calls[0].init.body as FormData;
    expect(form.get("token")).toBe("app-token");
    expect(form.get("user")).toBe("user-key");
    expect(form.get("title")).toBe("Monitor down");
    expect(form.get("priority")).toBe("1");
  });

  it("reports Pushover validation errors", async () => {
    const { send } = scripted([
      new Response(
        JSON.stringify({ status: 0, errors: ["app token invalid"] }),
        {
          status: 400,
        },
      ),
    ]);
    const result = await sendNotification(
      "pushover",
      { user_key: "u", token: "t" },
      payload,
      send,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("app token invalid");
  });

  it("POSTs JSON to a webhook by default", async () => {
    const { calls, body } = recorder();
    const result = await sendNotification(
      "webhook",
      { url: "https://hooks.example/notify" },
      payload,
      async (url, init) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      },
    );
    expect(result.success).toBe(true);
    expect(calls[0].init.method).toBe("POST");
    expect(
      (calls[0].init.headers as Record<string, string>)["Content-Type"],
    ).toBe("application/json");
    expect(body()).toEqual(payload);
  });

  it("GETs a webhook without a body and forwards custom headers", async () => {
    const { calls } = recorder();
    await sendNotification(
      "webhook",
      {
        url: "https://hooks.example/notify",
        method: "GET",
        headers: { "x-key": "v" },
      },
      payload,
      async (url, init) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      },
    );
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
    expect((calls[0].init.headers as Record<string, string>)["x-key"]).toBe(
      "v",
    );
  });

  it("surfaces a webhook transport failure", async () => {
    const { send } = scripted([new Error("ENOTFOUND")]);
    const result = await sendNotification(
      "webhook",
      { url: "https://hooks.example/notify" },
      payload,
      send,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("ENOTFOUND");
  });

  it("declines unimplemented and unknown types without sending", async () => {
    let called = false;
    const send: NotificationTransport = async () => {
      called = true;
      return new Response("{}", { status: 200 });
    };

    const email = await sendNotification(
      "email",
      { smtp_host: "h" },
      payload,
      send,
    );
    expect(email.success).toBe(false);
    expect(email.error).toContain("not yet implemented");

    const unknown = await sendNotification(
      "pagerduty" as never,
      {},
      payload,
      send,
    );
    expect(unknown.success).toBe(false);
    expect(called).toBe(false);
  });
});
