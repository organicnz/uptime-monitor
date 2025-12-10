// Incident status constants
export const INCIDENT_STATUS = {
  OPEN: 0,
  RESOLVED: 1,
  INVESTIGATING: 2,
} as const;

export const INCIDENT_STATUS_LABELS = {
  [INCIDENT_STATUS.OPEN]: "Open",
  [INCIDENT_STATUS.RESOLVED]: "Resolved",
  [INCIDENT_STATUS.INVESTIGATING]: "Investigating",
} as const;
