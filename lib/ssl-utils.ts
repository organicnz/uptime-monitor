/**
 * SSL Certificate Utilities
 *
 * Provides SSL certificate checking functionality for HTTPS monitors.
 * Uses an external approach since serverless environments can't access raw TLS certs.
 */

export type SslInfo = {
  issuer: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  isValid: boolean;
  subject: string;
};

export type SslCheckResult = {
  success: boolean;
  info: SslInfo | null;
  error?: string;
};

// Warning thresholds (in days)
export const SSL_WARNING_DAYS = 30;
export const SSL_CRITICAL_DAYS = 7;

/**
 * Check SSL certificate for a URL using SSL Labs-style API
 * Falls back to basic HTTPS check if API unavailable
 */
export async function checkSslCertificate(
  url: string,
): Promise<SslCheckResult> {
  try {
    const urlObj = new URL(url);

    // Only check HTTPS URLs
    if (urlObj.protocol !== "https:") {
      return {
        success: false,
        info: null,
        error: "URL is not HTTPS",
      };
    }

    const hostname = urlObj.hostname;

    // Use a public SSL checking service (no API key needed)
    // This is a lightweight check using crt.sh API for certificate transparency logs
    const certInfo = await fetchCertificateInfo(hostname);

    if (certInfo) {
      return {
        success: true,
        info: certInfo,
      };
    }

    // Fallback: Just verify HTTPS works and estimate expiry
    return await fallbackSslCheck(url);
  } catch (error) {
    return {
      success: false,
      info: null,
      error: error instanceof Error ? error.message : "SSL check failed",
    };
  }
}

/**
 * Fetch certificate info from crt.sh (Certificate Transparency logs)
 */
async function fetchCertificateInfo(hostname: string): Promise<SslInfo | null> {
  try {
    // Use crt.sh API to get certificate info
    const response = await fetch(
      `https://crt.sh/?q=${encodeURIComponent(hostname)}&output=json`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      return null;
    }

    const certs = (await response.json()) as Array<{
      issuer_name: string;
      not_before: string;
      not_after: string;
      common_name: string;
    }>;

    if (!certs || certs.length === 0) {
      return null;
    }

    // Get the most recent valid certificate
    const now = new Date();
    const validCerts = certs
      .filter((cert) => new Date(cert.not_after) > now)
      .sort(
        (a, b) =>
          new Date(b.not_before).getTime() - new Date(a.not_before).getTime(),
      );

    if (validCerts.length === 0) {
      return null;
    }

    const cert = validCerts[0];
    const validTo = new Date(cert.not_after);
    const daysRemaining = Math.floor(
      (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      issuer: cert.issuer_name,
      validFrom: cert.not_before,
      validTo: cert.not_after,
      daysRemaining,
      isValid: daysRemaining > 0,
      subject: cert.common_name,
    };
  } catch {
    return null;
  }
}

/**
 * Fallback SSL check - just verify HTTPS connection works
 */
async function fallbackSslCheck(url: string): Promise<SslCheckResult> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });

    // If we got a response over HTTPS, the cert is valid
    if (response.ok || response.status < 500) {
      return {
        success: true,
        info: {
          issuer: "Unknown (fallback check)",
          validFrom: "",
          validTo: "",
          daysRemaining: -1, // Unknown
          isValid: true,
          subject: new URL(url).hostname,
        },
      };
    }

    return {
      success: false,
      info: null,
      error: `HTTPS check failed: ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      info: null,
      error: error instanceof Error ? error.message : "HTTPS check failed",
    };
  }
}

/**
 * Calculate days remaining until SSL certificate expires
 */
export function getSslDaysRemaining(expiryDate: string | Date): number {
  const expiry =
    typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get SSL expiry status for display
 */
export function getSslExpiryStatus(daysRemaining: number): {
  status: "ok" | "warning" | "critical" | "expired" | "unknown";
  label: string;
  color: string;
} {
  if (daysRemaining < 0 && daysRemaining !== -1) {
    return { status: "expired", label: "Expired", color: "red" };
  }
  if (daysRemaining === -1) {
    return { status: "unknown", label: "Unknown", color: "gray" };
  }
  if (daysRemaining <= SSL_CRITICAL_DAYS) {
    return {
      status: "critical",
      label: `${daysRemaining}d remaining`,
      color: "red",
    };
  }
  if (daysRemaining <= SSL_WARNING_DAYS) {
    return {
      status: "warning",
      label: `${daysRemaining}d remaining`,
      color: "yellow",
    };
  }
  return { status: "ok", label: `${daysRemaining}d remaining`, color: "green" };
}

/**
 * Check if SSL expiry warning should be sent
 */
export function shouldWarnSslExpiry(
  daysRemaining: number,
  lastWarningDays?: number,
): boolean {
  // Don't warn if unknown
  if (daysRemaining === -1) return false;

  // Warn at specific thresholds: 30, 14, 7, 3, 1 days
  const warningThresholds = [30, 14, 7, 3, 1];

  for (const threshold of warningThresholds) {
    if (daysRemaining <= threshold) {
      // Only warn if we haven't warned at this threshold yet
      if (lastWarningDays === undefined || lastWarningDays > threshold) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Format SSL info for display
 */
export function formatSslInfo(info: SslInfo): string {
  const lines = [
    `Subject: ${info.subject}`,
    `Issuer: ${info.issuer}`,
    `Valid From: ${info.validFrom}`,
    `Valid To: ${info.validTo}`,
    `Days Remaining: ${info.daysRemaining === -1 ? "Unknown" : info.daysRemaining}`,
  ];
  return lines.join("\n");
}
