import type { Node } from "tsrs/unstable/ast";
import { TypeFlags } from "tsrs/unstable/async";

import type { Checker, Type } from "./session";

/**
 * The questions every rule asks about a type.
 *
 * These are the answers to "is this `any`?", "is this a promise?" and so
 * on, and they are the same questions in every rule, so they are asked
 * once.
 */

/** Is the type `any`? */
export function isAny(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.Any) !== 0;
}

/** Is the type `unknown`? */
export function isUnknown(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.Unknown) !== 0;
}

/** Is the type `never`? */
export function isNever(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.Never) !== 0;
}

/**
 * Is the type the error type?
 *
 * When the compiler cannot work out a type — because the code does not
 * type check — it yields the error type, and every question about it has
 * no answer. A rule that needs to know what a value *is* has nothing to
 * say about it.
 */
export function isErrorType(type: Type | undefined): boolean {
  return type !== undefined && type.isErrorType();
}

/**
 * Does the type match, counting a union as matching only when every one
 * of its members matches?
 *
 * A union's own flags say nothing about what is in it: `"a" | "b"` is a
 * union, and its flags are `Union` and not `StringLike`. The members are
 * what carry the information, so a union is asked about its members.
 */
async function matches(
  type: Type | undefined,
  predicate: (type: Type) => boolean,
): Promise<boolean> {
  if (type === undefined) return false;
  if (!type.isUnionType()) return predicate(type);

  const constituents = await type.getTypes();
  return constituents.every(predicate);
}

/** Is the type a string, a string literal, or a template literal? */
export function isStringLike(type: Type | undefined): Promise<boolean> {
  return matches(type, (t) => (t.flags & TypeFlags.StringLike) !== 0);
}

/** Is the type a number or a numeric literal? */
export function isNumberLike(type: Type | undefined): Promise<boolean> {
  return matches(type, (t) => (t.flags & TypeFlags.NumberLike) !== 0);
}

/** Is the type a boolean or a boolean literal? */
export function isBooleanLike(type: Type | undefined): Promise<boolean> {
  return matches(type, (t) => (t.flags & TypeFlags.BooleanLike) !== 0);
}

/** Is the type a bigint or a bigint literal? */
export function isBigIntLike(type: Type | undefined): Promise<boolean> {
  return matches(type, (t) => (t.flags & TypeFlags.BigIntLike) !== 0);
}

/** Is the type `void`? */
export function isVoid(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.Void) !== 0;
}

/** Is the type `object` — anything that is not a primitive? */
export function isNonPrimitive(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.NonPrimitive) !== 0;
}

/** Is the type an object, a class, an interface, or a type literal? */
export function isObject(type: Type | undefined): boolean {
  return type !== undefined && (type.flags & TypeFlags.Object) !== 0;
}

/**
 * Is the type a thenable — something with a `then` method?
 *
 * A promise is a thenable, and so is anything else that has a `then`, so
 * the question is asked of the shape rather than of the name.
 *
 * A union is thenable when any of its members is. `number | Promise<number>`
 * is awaited to a number either way, so awaiting it is not a mistake —
 * and the rule that says so is the one that matters.
 */
export async function isThenable(type: Type | undefined): Promise<boolean> {
  if (type === undefined) return false;
  if (isAny(type) || isUnknown(type)) return false;

  if (type.isUnionType()) {
    const constituents = await type.getTypes();
    const answers = await Promise.all(constituents.map(isThenable));
    return answers.some(Boolean);
  }

  const then = await type.getProperty("then");
  return then !== undefined;
}

/**
 * Is the type an array?
 *
 * The check is on the shape: an array has a `length` and a `push`.
 */
export async function isArrayType(type: Type | undefined): Promise<boolean> {
  if (type === undefined) return false;

  const [length, push] = await Promise.all([
    type.getProperty("length"),
    type.getProperty("push"),
  ]);
  return length !== undefined && push !== undefined;
}

/**
 * Is the type an error, or something that is treated as one?
 *
 * The rule this serves — `only-throw-error` — allows anything whose type
 * is `unknown` or `any` to be thrown, because the compiler cannot say.
 * An error has a `stack` or a `message`.
 */
export async function isErrorLike(type: Type | undefined): Promise<boolean> {
  if (type === undefined) return false;
  if (isAny(type) || isUnknown(type)) return true;

  const [stack, message] = await Promise.all([
    type.getProperty("stack"),
    type.getProperty("message"),
  ]);
  return stack !== undefined || message !== undefined;
}

/**
 * The name of a type, for the message.
 *
 * Printing a type is a round trip, and only the messages that quote a
 * type pay for it. A violation is rare; a node is not.
 */
export async function typeName(
  checker: Checker,
  type: Type | undefined,
): Promise<string> {
  if (type === undefined) return "unknown";
  return checker.typeToString(type);
}

/**
 * Is the type `null` or `undefined`?
 *
 * A union is nullish when any of its constituents is, because that is
 * what "may be nullish" means.
 */
export async function isNullish(type: Type | undefined): Promise<boolean> {
  if (type === undefined) return false;
  if ((type.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0) return true;
  if (!type.isUnionType()) return false;

  const constituents = await type.getTypes();
  return constituents.some(
    (constituent) =>
      (constituent.flags & (TypeFlags.Null | TypeFlags.Undefined)) !== 0,
  );
}

/**
 * The nodes of a kind, or nothing.
 *
 * The buckets are shared, and a rule that asks for a kind the file does
 * not have gets an empty list rather than a crash.
 */
export function ofKind(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): Node[] {
  return nodes.byKind.get(kind) ?? [];
}
