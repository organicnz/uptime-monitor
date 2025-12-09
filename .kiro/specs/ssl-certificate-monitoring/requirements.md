# SSL Certificate Monitoring

## Overview

Automatically monitor SSL/TLS certificate expiration and health for HTTPS monitors, alerting users before certificates expire.

## Requirements

### Functional Requirements

1. **Automatic SSL Detection**
   - Extract SSL certificate info during HTTP/HTTPS checks
   - Store certificate expiration date, issuer, and validity
   - No additional configuration required for existing HTTPS monitors

2. **Certificate Alerts**
   - Configurable warning thresholds (default: 30, 14, 7, 1 days)
   - Notifications sent at each threshold
   - Separate from uptime notifications (can be toggled)

3. **Certificate Dashboard**
   - List all monitored certificates with expiration dates
   - Visual indicators: green (>30d), yellow (7-30d), red (<7d)
   - Sort by expiration date
   - Quick filter for expiring soon

4. **Certificate Details**
   - Issuer information (Let's Encrypt, DigiCert, etc.)
   - Certificate chain validation status
   - Subject Alternative Names (SANs)
   - Protocol version (TLS 1.2, 1.3)

### Non-Functional Requirements

- Certificate check adds <100ms to HTTP check time
- Certificate data cached, refreshed every 6 hours max
- Historical certificate data retained for 90 days

## User Stories

- As a user, I want to be notified before my SSL certificates expire
- As a user, I want to see all my certificates in one dashboard
- As a user, I want to know if my certificate chain is valid

## Out of Scope

- Certificate provisioning/renewal
- Certificate Authority recommendations
- Client certificate authentication monitoring
