import { describe, expect, it } from "bun:test";
import {
  ALL_SENSITIVE_CONFIG_KEYS,
  SENSITIVE_CONFIG_KEYS,
  isSensitiveConfigKey,
  mergeChannelConfig,
  notificationTypes,
  splitChannelConfig,
} from "@/lib/notification-types";

describe("notification config splitting", () => {
  it("moves every credential out of config and into secret", () => {
    for (const type of notificationTypes) {
      const { config, secret } = splitChannelConfig(type, {
        bot_token: "t",
        chat_id: "c",
        webhook_url: "https://example.test/hook",
        url: "https://example.test/hook",
        headers: { Authorization: "Bearer x" },
        user_key: "u",
        token: "p",
        password: "pw",
        smtp_host: "smtp.example.test",
        smtp_port: 587,
        username: "user",
        to: "a@b.test",
      });

      for (const key of SENSITIVE_CONFIG_KEYS[type]) {
        expect(Object.keys(secret)).toContain(key);
        expect(Object.keys(config)).not.toContain(key);
      }
    }
  });

  it("keeps non-credential settings in config", () => {
    const { config, secret } = splitChannelConfig("telegram", {
      bot_token: "123:abc",
      chat_id: "-100999",
    });

    expect(config).toEqual({ chat_id: "-100999" });
    expect(secret).toEqual({ bot_token: "123:abc" });
  });

  it("treats every empty or undefined field as absent", () => {
    const { config, secret } = splitChannelConfig("discord", {
      webhook_url: "   ".trim() || "",
      name: "",
    });

    expect(secret).toEqual({});
    expect(config).toEqual({});
  });

  it("exposes a flat list of blocked keys for the database guard", () => {
    expect(ALL_SENSITIVE_CONFIG_KEYS).toContain("bot_token");
    expect(ALL_SENSITIVE_CONFIG_KEYS).toContain("webhook_url");
    expect(ALL_SENSITIVE_CONFIG_KEYS).toContain("headers");
    expect(ALL_SENSITIVE_CONFIG_KEYS).toContain("password");
    expect(new Set(ALL_SENSITIVE_CONFIG_KEYS).size).toBe(
      ALL_SENSITIVE_CONFIG_KEYS.length,
    );
  });

  it("classifies keys per type, not globally", () => {
    // A webhook URL is a bearer capability for the chat platforms, but the
    // same key name is a credential on all of them.
    expect(isSensitiveConfigKey("discord", "webhook_url")).toBe(true);
    expect(isSensitiveConfigKey("telegram", "webhook_url")).toBe(false);
    expect(isSensitiveConfigKey("telegram", "chat_id")).toBe(false);
  });

  it("round-trips through merge without losing anything", () => {
    const original = { bot_token: "123:abc", chat_id: "-100999" };
    const { config, secret } = splitChannelConfig("telegram", original);
    expect(mergeChannelConfig(config, secret)).toEqual(original);
  });

  it("lets a stored credential win over an absent field on merge", () => {
    expect(mergeChannelConfig({ chat_id: "1" }, { bot_token: "t" })).toEqual({
      chat_id: "1",
      bot_token: "t",
    });
  });

  it("treats a missing secret as a plain config", () => {
    expect(mergeChannelConfig({ chat_id: "1" }, null)).toEqual({
      chat_id: "1",
    });
  });
});
