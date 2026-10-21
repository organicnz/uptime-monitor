import { processMonitorCheck } from "@/lib/monitor-checker";

/**
 * The seam the manual-check route runs a check through.
 *
 * It is a module of its own for one reason: `mock.module` in Bun is
 * process-wide. A test that stubs the route's checker by replacing
 * `@/lib/monitor-checker` hands the stub to *every* test file that
 * imports the real one — so a test of the state machine would silently
 * be testing a recorder instead.
 *
 * Stubbing this module instead replaces only the route's dependency, and
 * leaves `@/lib/monitor-checker` itself real for everyone else.
 */
export const runMonitorCheck = processMonitorCheck;
