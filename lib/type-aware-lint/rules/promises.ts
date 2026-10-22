import { SyntaxKind } from "tsrs/unstable/ast";
import type {
  AwaitExpression,
  CallExpression,
  Expression,
  ExpressionStatement,
  Node,
  PropertyAccessExpression,
  ReturnStatement,
} from "tsrs/unstable/ast";

import { isAny, isThenable, isUnknown, isVoid, ofKind } from "../helpers";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/**
 * Is this call one of the ways a promise is handled?
 *
 * A promise is handled when it is awaited, when it is given a rejection
 * handler — `.catch(handler)` or `.then(onFulfilled, onRejected)` — or
 * when it is marked as deliberately ignored with `void`.
 */
function isHandled(expression: Expression): boolean {
  // `void promise` — the intent to ignore it, made explicit.
  if (expression.kind === SyntaxKind.VoidExpression) return true;

  if (expression.kind !== SyntaxKind.CallExpression) return false;
  const call = expression as CallExpression;
  const callee = call.expression;
  if (callee.kind !== SyntaxKind.PropertyAccessExpression) return false;

  const name = (callee as PropertyAccessExpression).name?.text;
  // `.then(onFulfilled)` alone does not handle the rejection.
  if (name === "then") return call.arguments.length >= 2;
  if (name === "catch") return call.arguments.length >= 1;

  return false;
}

/**
 * `no-floating-promises`: a promise that nobody waits for.
 *
 * A promise that nobody awaits runs on its own. If it rejects, the `try`
 * around the call does not catch the error, and the code after it runs
 * before the work is done.
 */
const noFloatingPromises: Rule = {
  name: "@typescript-eslint/no-floating-promises",
  select(nodes) {
    const about = ofKindAs<ExpressionStatement>(
      nodes,
      SyntaxKind.ExpressionStatement,
    );
    return { about, wanted: about.map((node) => node.expression) };
  },
  async report(context) {
    const about = ofKindAs<ExpressionStatement>(
      context.nodes,
      SyntaxKind.ExpressionStatement,
    );

    await Promise.all(
      about.map(async (node) => {
        const expression = node.expression;
        if (isHandled(expression)) return;
        // An `await` in statement position is the awaited value, not a
        // promise left behind.
        if (expression.kind === SyntaxKind.AwaitExpression) return;
        // An assignment stores the promise; it does not leave it behind.
        if (expression.kind === SyntaxKind.BinaryExpression) return;

        const type = context.typeOf(expression);
        if (!(await isThenable(type))) return;

        context.report(
          this.name,
          expression,
          "Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with `void`.",
        );
      }),
    );
  },
};

/**
 * `await-thenable`: awaiting something that is not a promise.
 *
 * `await 42` resolves immediately, so it is almost always a mistake: the
 * author meant to await a promise and the type says there is none.
 */
const awaitThenable: Rule = {
  name: "@typescript-eslint/await-thenable",
  select(nodes) {
    const about = ofKindAs<AwaitExpression>(nodes, SyntaxKind.AwaitExpression);
    return { about, wanted: about.map((node) => node.expression) };
  },
  async report(context) {
    const about = ofKindAs<AwaitExpression>(
      context.nodes,
      SyntaxKind.AwaitExpression,
    );

    await Promise.all(
      about.map(async (node) => {
        const type = context.typeOf(node.expression);
        if (isAny(type) || isUnknown(type)) return;
        if (await isThenable(type)) return;

        context.report(
          this.name,
          node,
          'Unexpected await of a non-Promise (non-"Thenable") value.',
        );
      }),
    );
  },
};

/**
 * `prefer-promise-reject-errors`: rejecting with something that is not an
 * error.
 *
 * A rejection value that is not an `Error` has no stack, so the thing
 * that failed cannot be found in the logs.
 */
const preferPromiseRejectErrors: Rule = {
  name: "@typescript-eslint/prefer-promise-reject-errors",
  select(nodes) {
    const about: Node[] = [];
    const wanted: Node[] = [];

    for (const call of ofKindAs<CallExpression>(
      nodes,
      SyntaxKind.CallExpression,
    )) {
      const callee = call.expression;
      if (callee.kind !== SyntaxKind.PropertyAccessExpression) continue;
      const name = (callee as PropertyAccessExpression).name?.text;
      if (name !== "reject" && name !== "rejectWithReason") continue;

      const owner = (callee as PropertyAccessExpression).expression;
      if (owner.kind !== SyntaxKind.Identifier) continue;
      if ((owner as { text?: string }).text !== "Promise") continue;

      about.push(call);
      for (const argument of call.arguments) wanted.push(argument);
    }

    return { about, wanted };
  },
  async report(context) {
    for (const node of ofKindAs<CallExpression>(
      context.nodes,
      SyntaxKind.CallExpression,
    )) {
      const callee = node.expression;
      if (callee.kind !== SyntaxKind.PropertyAccessExpression) continue;
      const name = (callee as PropertyAccessExpression).name?.text;
      if (name !== "reject" && name !== "rejectWithReason") continue;

      for (const argument of node.arguments) {
        const type = context.typeOf(argument);
        if (isAny(type) || isUnknown(type)) continue;

        if (type === undefined) continue;
        const error = await type.getProperty("stack");
        const message = await type.getProperty("message");
        if (error !== undefined || message !== undefined) continue;

        context.report(
          this.name,
          node,
          "Expected the Promise rejection reason to be an Error.",
        );
      }
    }
  },
};

/**
 * `no-misused-promises`: a promise where the function wanted a value.
 *
 * The rule is narrow on purpose, and the narrowness is what the rule it
 * replaces does. A promise handed to a function that returns `void` is
 * the mistake: the function does not wait for it, and the caller has no
 * way to. A function that takes a promise is doing the right thing, and
 * a function that returns one is saying so in its type.
 */
const noMisusedPromises: Rule = {
  name: "@typescript-eslint/no-misused-promises",
  select(nodes) {
    const about = ofKindAs<CallExpression>(nodes, SyntaxKind.CallExpression);
    const wanted: Node[] = [];
    for (const call of about) {
      for (const argument of call.arguments) wanted.push(argument);
    }
    return { about, wanted };
  },
  async report(context) {
    const about = ofKindAs<CallExpression>(
      context.nodes,
      SyntaxKind.CallExpression,
    );

    await Promise.all(
      about.map(async (node) => {
        if (node.arguments.length === 0) return;

        // The function has to be one that does not wait for its
        // arguments. A function that returns a promise is going to chain
        // them, and a function that returns something else is going to
        // use the value.
        const signature = await context.checker.getResolvedSignature(node);
        const returnType = await signature.getReturnType();
        if (!isVoid(returnType)) return;

        await Promise.all(
          node.arguments.map(async (argument) => {
            const type = context.typeOf(argument);
            if (!(await isThenable(type))) return;

            // The parameter has to be checked too: a function that takes a
            // promise is doing the right thing.
            const index = node.arguments.indexOf(argument);
            const parameterType = await context.checker.getParameterType(
              signature,
              index,
            );
            if (await isThenable(parameterType)) return;
            // A parameter that is `any` accepts a promise, so there is
            // nothing to be misused.
            if (isAny(parameterType) || isUnknown(parameterType)) return;

            context.report(
              this.name,
              argument,
              "Promise returned by function is treated as a value.",
            );
          }),
        );
      }),
    );
  },
};

/**
 * `no-floating-promises` also covers the promises handed back from a
 * function whose return type is a promise, in a position that is not a
 * statement. Those are `ReturnStatement`s inside an `async` function that
 * returns a promise where the signature says otherwise — rare enough that
 * the `async` function's own signature is the only place it shows up, and
 * the compiler already catches it.
 *
 * `return-await` is the rule that wants a `return` to say `return await`.
 * It is a style rule that needs the function's signature, and the
 * repository does not enable it.
 */
export const promiseRules: Rule[] = [
  noFloatingPromises,
  awaitThenable,
  preferPromiseRejectErrors,
  noMisusedPromises,
];

/** Kept for the rule that reads a return statement's type. */
export type { ReturnStatement };
