/**
 * A file with one deliberate violation of every type-aware rule.
 *
 * The file breaks rules that need types, and some of them can only be
 * broken by code that does not type check — an enum compared with a
 * number, a `+` on an object. The compiler catches those, and the
 * compiler is the gate, so the fixture has its own `tsconfig.json` and
 * the project's excludes it.
 *
 * The fixture's configuration extends the project's, so the rules see the
 * same types here as they would anywhere else, and it includes this
 * directory, which the project's configuration excludes.
 *
 * It breaks no rule that does not need types, apart from the two the
 * configuration turns off for this directory: the `any` is the point of
 * the `no-unsafe-*` rules, and `no-implied-eval` is one the linter
 * implements without types, so the ordinary run reports it too.
 *
 * It lives outside `__tests__/` on purpose. The test tree turns off
 * several of these rules — a mock has to keep the async signature of the
 * thing it replaces, and a test's `expect` is not a floating promise — and
 * a fixture that the overrides silence would compare nothing.
 *
 * It is not a test file, so the test runner does not pick it up, and
 * nothing imports it, so the coverage report does not mention it.
 */

declare const anyValue: any;

class Counter {
  count = 0;
  increment(): number {
    this.count += 1;
    return this.count;
  }
}

interface Options {
  name: string;
}

function takesString(value: string): string {
  return value;
}

async function resolves(): Promise<number> {
  return 1;
}

export function violations(): void {
  // no-floating-promises
  resolves();

  // prefer-promise-reject-errors
  Promise.reject("a string");

  // no-unsafe-call
  anyValue();

  // no-unsafe-argument
  takesString(anyValue);

  // only-throw-error
  try {
    throw "a string";
  } catch {
    // Nothing to do.
  }

  // unbound-method
  const { increment } = new Counter();
  takesString(String(increment));

  // restrict-plus-operands — the compiler catches this one too.
  const added = 1 + ({} as object);
  takesString(String(added));
}

// no-unsafe-assignment
export const assigned: string = anyValue;

// no-unsafe-member-access
export const member = anyValue.member;

// no-unsafe-return
export const unsafeReturn = (): string => {
  return anyValue;
};

// no-unsafe-unary-minus
export const negated = -"a string";

// restrict-template-expressions
export const interpolated = `${{ name: "value" } as Options}`;

// no-array-delete
const list: number[] = [1, 2, 3];
delete list[0];

// no-for-in-array
for (const key in list) {
  takesString(key);
}

// require-await
export async function neverAwaits(): Promise<void> {
  Math.random();
}

// no-unnecessary-type-assertion
export const unnecessary = anyValue as any;

// no-duplicate-type-constituents
export type Duplicate = string | string;

// no-redundant-type-constituents
export type Redundant = unknown | string;

// no-unsafe-enum-comparison — the compiler catches this one too.
enum Direction {
  Up = "up",
  Down = "down",
}

export function compare(direction: Direction): boolean {
  return direction === 1;
}

export const options: Options = { name: "value" };
