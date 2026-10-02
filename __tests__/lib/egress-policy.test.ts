import { describe, expect, it } from "bun:test";
import { isSafeIp } from "@/lib/security";
import {
  BLOCKED_HOSTNAME_SUFFIXES,
  isBlockedHostname,
  isPublicAddress,
  planRedirect,
} from "../../supabase/functions/_shared/egress-policy";

describe("isPublicAddress", () => {
  it("blocks IPv4 private, loopback, link-local and metadata addresses", () => {
    const blocked = [
      "0.0.0.0",
      "0.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "100.64.0.1",
      "100.127.255.255",
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.1",
      "255.255.255.255",
    ];
    for (const address of blocked) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("allows public IPv4 addresses", () => {
    const allowed = [
      "1.1.1.1",
      "8.8.8.8",
      "93.184.216.34",
      "104.16.0.1",
      "172.15.255.255",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "192.0.1.1",
      "198.20.0.1",
      "203.0.114.1",
      "223.255.255.255",
    ];
    for (const address of allowed) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });

  it("blocks IPv6 loopback, link-local, unique-local, multicast and NAT64", () => {
    const blocked = [
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "fe80::1",
      "febf::1",
      "fc00::1",
      "fd12:3456::1",
      "ff02::1",
      "fec0::1",
      "100::1",
      "64:ff9b::7f00:1",
      "2001:db8::1",
      "2001:5::1",
      "3fff::1",
    ];
    for (const address of blocked) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("allows public IPv6 addresses", () => {
    const allowed = [
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
      "2a00:1450:4001:80f::200e",
      "::ffff:8.8.8.8",
      "2001:8000::1",
    ];
    for (const address of allowed) {
      expect(isPublicAddress(address)).toBe(true);
    }
  });

  it("fails closed on unparseable input", () => {
    const junk = [
      "",
      "abc",
      "999.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "1.2.3.256",
      "not:an:ip",
      "::gggg",
      "::1::2",
      "....",
    ];
    for (const address of junk) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("treats an IPv4-mapped private address as private", () => {
    expect(isPublicAddress("::ffff:192.168.0.1")).toBe(false);
    // Hex-encoded mapped form must be unwrapped too, not read as plain v6.
    expect(isPublicAddress("::ffff:c0a8:1")).toBe(false);
    expect(isPublicAddress("::ffff:0808:0808")).toBe(true);
  });
});

describe("parity with the Node runtime's ipaddr.js guard", () => {
  /**
   * The two runtimes resolve with different libraries, so the edge classifier
   * is hand-rolled. If it ever blocks *less* than `ipaddr.js` the edge would
   * be the weaker path, so this asserts one direction only:
   *   isSafeIp(x) === false  =>  isPublicAddress(x) === false
   * The edge being stricter than Node is allowed; being weaker is the bug.
   */
  const corpus: string[] = [];

  // Sweep the first octet so any /8-level divergence shows up.
  for (let octet = 0; octet <= 255; octet++) {
    corpus.push(
      `${octet}.0.0.1`,
      `${octet}.128.0.1`,
      `${octet}.255.255.254`,
      `${octet}.255.255.255`,
    );
  }

  // Boundaries of the non-/8 blocked ranges plus their immediate neighbours.
  corpus.push(
    "100.64.0.1",
    "100.127.255.255",
    "100.63.255.255",
    "100.128.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "172.15.255.255",
    "172.32.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "255.255.255.255",
  );

  // Representative addresses for every IPv6 special range ipaddr.js knows.
  corpus.push(
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:0.0.0.1",
    "fe80::1",
    "fec0::1",
    "fc00::1",
    "fd00:ec2::254",
    "ff00::1",
    "100::1",
    "64:ff9b::1",
    "64:ff9b:1::1",
    "2001::1",
    "2001:2::1",
    "2001:db8::1",
    "2001:10::1",
    "2001:20::1",
    "2001:30::1",
    "2001:4:112::1",
    "2620:4f:8000::1",
    "3fff::1",
    "5f00::1",
    "2002::1",
  );

  // Public addresses must be allowed by both (guards must not brick delivery).
  const publicSamples = [
    "1.1.1.1",
    "8.8.8.8",
    "9.9.9.9",
    "93.184.216.34",
    "104.16.0.1",
    "172.32.0.1",
    "100.128.0.1",
    "198.20.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ];
  corpus.push(...publicSamples);

  it("never under-blocks relative to ipaddr.js", () => {
    const divergent: string[] = [];
    for (const address of corpus) {
      if (!isSafeIp(address) && isPublicAddress(address)) {
        divergent.push(address);
      }
    }
    expect(divergent).toEqual([]);
  });

  it("agrees with ipaddr.js on public addresses", () => {
    for (const address of publicSamples) {
      expect(isSafeIp(address)).toBe(true);
      expect(isPublicAddress(address)).toBe(true);
    }
  });

  it("blocks everything ipaddr.js classifies as reserved or private", () => {
    const mustBlock = [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.0.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "fe80::1",
      "fc00::1",
      "ff00::1",
      "64:ff9b::1",
      "2001:db8::1",
    ];
    for (const address of mustBlock) {
      expect(isSafeIp(address)).toBe(false);
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});

describe("isBlockedHostname", () => {
  it("blocks the shared suffix list", () => {
    for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
      expect(isBlockedHostname(`host${suffix}`)).toBe(true);
    }
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
    expect(isBlockedHostname("printer.LOCAL")).toBe(true);
  });

  it("allows normal notification destinations", () => {
    for (const host of [
      "example.com",
      "hooks.slack.com",
      "discord.com",
      "internal.example.com",
      "notlocal.com",
      "",
    ]) {
      expect(isBlockedHostname(host)).toBe(false);
    }
  });
});

describe("planRedirect", () => {
  const base = {
    currentUrl: "https://example.com/a",
    method: "POST",
    initialOrigin: "https://example.com",
  };

  it("returns null for non-redirect statuses", () => {
    expect(planRedirect({ ...base, status: 200, location: "/b" })).toBeNull();
    expect(planRedirect({ ...base, status: 404, location: "/b" })).toBeNull();
    expect(planRedirect({ ...base, status: 500, location: "/b" })).toBeNull();
  });

  it("returns null when Location is missing or unparseable", () => {
    expect(planRedirect({ ...base, status: 302, location: null })).toBeNull();
    expect(planRedirect({ ...base, status: 302, location: "" })).toBeNull();
  });

  it("keeps the method on a same-origin 307", () => {
    const step = planRedirect({ ...base, status: 307, location: "/b" });
    expect(step).toEqual({
      url: "https://example.com/b",
      method: "POST",
      crossOrigin: false,
    });
  });

  it("downgrades POST to GET on same-origin 301/302/303", () => {
    for (const status of [301, 302, 303]) {
      const step = planRedirect({ ...base, status, location: "/b" });
      expect(step?.method).toBe("GET");
      expect(step?.crossOrigin).toBe(false);
    }
  });

  it("resolves relative Location against the current URL", () => {
    const step = planRedirect({ ...base, status: 302, location: "../c" });
    expect(step?.url).toBe("https://example.com/c");
  });

  it("flags a cross-origin hop so headers are dropped", () => {
    const step = planRedirect({
      ...base,
      status: 302,
      location: "https://other.example/x",
    });
    expect(step).toEqual({
      url: "https://other.example/x",
      method: "GET",
      crossOrigin: true,
    });
  });

  it("drops the body when cross-origin", () => {
    const step = planRedirect({
      ...base,
      status: 307,
      location: "https://other.example/x",
    });
    expect(step?.method).toBe("GET");
    expect(step?.crossOrigin).toBe(true);
  });
});
