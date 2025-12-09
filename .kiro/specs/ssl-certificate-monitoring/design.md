# SSL Certificate Monitoring - Design

## Database Schema

### New Table: ssl_certificates

```sql
CREATE TABLE ssl_certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  issuer TEXT,
  issuer_org TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  days_remaining INTEGER,
  protocol TEXT, -- TLS 1.2, TLS 1.3
  sans TEXT[], -- Subject Alternative Names
  chain_valid BOOLEAN DEFAULT true,
  chain_error TEXT,
  fingerprint TEXT,
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id)
);

CREATE INDEX idx_ssl_certs_valid_to ON ssl_certificates(valid_to);
CREATE INDEX idx_ssl_certs_days_remaining ON ssl_certificates(days_remaining);
```

### Monitor Table Additions

```sql
ALTER TABLE monitors ADD COLUMN ssl_check_enabled BOOLEAN DEFAULT true;
ALTER TABLE monitors ADD COLUMN ssl_warning_days INTEGER[] DEFAULT ARRAY[30, 14, 7, 1];
```

## Type Definitions

```typescript
// types/database.ts
export interface SSLCertificate {
  id: string;
  monitor_id: string;
  domain: string;
  issuer: string | null;
  issuer_org: string | null;
  valid_from: string | null;
  valid_to: string | null;
  days_remaining: number | null;
  protocol: string | null;
  sans: string[] | null;
  chain_valid: boolean;
  chain_error: string | null;
  fingerprint: string | null;
  last_checked: string;
}
```

## SSL Checker Implementation

```typescript
// lib/ssl-checker.ts
import tls from "tls";

export interface SSLCheckResult {
  valid: boolean;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
  issuer: string;
  issuerOrg: string;
  protocol: string;
  sans: string[];
  chainValid: boolean;
  chainError?: string;
  fingerprint: string;
}

export async function checkSSLCertificate(
  hostname: string,
  port = 443,
): Promise<SSLCheckResult> {
  // Use Node.js tls module to connect and extract cert info
  // Return structured certificate data
}
```

## Notification Flow

1. After HTTP check completes, check if `ssl_check_enabled`
2. Extract certificate info, update `ssl_certificates` table
3. Calculate `days_remaining`
4. If `days_remaining` crosses a threshold in `ssl_warning_days`:
   - Check if notification already sent for this threshold
   - Send notification via configured channels
   - Record notification sent

## UI Components

### Certificate List Page

- Table with columns: Domain, Issuer, Expires, Days Left, Status
- Color-coded status badges
- Click to expand certificate details
- Filter: All, Expiring Soon, Expired, Valid

### Certificate Card

```tsx
<CertificateCard
  domain="api.example.com"
  issuer="Let's Encrypt"
  expiresAt="2025-02-15"
  daysRemaining={68}
  status="valid" // valid | warning | critical | expired
/>
```

## API Endpoints

### GET /api/certificates

List all certificates for authenticated user

### GET /api/certificates/expiring

List certificates expiring within N days (query param)

### GET /api/monitors/[id]/certificate

Get certificate details for specific monitor
