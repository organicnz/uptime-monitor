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

/**
 * The year the footer is stamped with.
 *
 * Reading the clock during a render makes the value unstable: the
 * server's clock and the browser's clock can disagree, and a client
 * component that renders the year is a component whose HTML is not the
 * same on both sides of hydration. The framework refuses to prerender a
 * page whose output changes from one render to the next, which is the
 * right refusal — the value is content, not a runtime value.
 *
 * So it is read once, when the module loads, and it stays that way
 * until the next build. A year boundary is the only thing that can
 * make it stale, and the next build fixes that.
 */
export const COPYRIGHT_YEAR = new Date().getFullYear();
