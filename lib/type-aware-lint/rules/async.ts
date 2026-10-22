import { SyntaxKind as Kind } from "tsrs/unstable/ast";
import type { Node, ReturnStatement } from "tsrs/unstable/ast";
import { ModifierFlags } from "tsrs/unstable/async";

import { isThenable, ofKind } from "../helpers";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/** A function that has a body: a declaration, an expression, or a method. */
type FunctionLike = Node & {
  body?: Node;
  modifierFlags?: number;
  name?: Node & { text?: string };
};

/**
 * The return statements of a function.
 *
 * The walk stops at a nested function: a return inside a callback belongs
 * to the callback, and the callback has its own rule to answer.
 */
function returnStatements(body: Node | undefined): ReturnStatement[] {
  if (!body) return [];
  const found: ReturnStatement[] = [];

  const walk = (node: Node): void => {
    if (node.kind === Kind.ReturnStatement) {
      found.push(node as ReturnStatement);
      return;
    }
    if (
      node.kind === Kind.FunctionDeclaration ||
      node.kind === Kind.FunctionExpression ||
      node.kind === Kind.ArrowFunction ||
      node.kind === Kind.MethodDeclaration
    ) {
      return;
    }
    node.forEachChild(walk);
  };

  walk(body);
  return found;
}

/**
 * `require-await`: an `async` function that never awaits.
 *
 * The `async` keyword promises a promise back. A function that never
 * awaits does not need the promise, and the caller has to unwrap it.
 *
 * A function that *returns* a promise is a different case: there the
 * `async` is doing the awaiting, because an async function awaits the
 * promise it returns.
 */
const requireAwait: Rule = {
  name: "@typescript-eslint/require-await",
  select(nodes) {
    const about = [
      ...ofKindAs<FunctionLike>(nodes, Kind.FunctionDeclaration),
      ...ofKindAs<FunctionLike>(nodes, Kind.FunctionExpression),
      ...ofKindAs<FunctionLike>(nodes, Kind.ArrowFunction),
      ...ofKindAs<FunctionLike>(nodes, Kind.MethodDeclaration),
    ];
    const wanted: Node[] = [];
    for (const node of about) {
      for (const statement of returnStatements(node.body)) {
        if (statement.expression) wanted.push(statement.expression);
      }
      // An arrow function with an expression body returns that body.
      if (node.body && node.body.kind !== Kind.Block) wanted.push(node.body);
    }
    return { about, wanted };
  },
  async report(context) {
    const about = [
      ...ofKindAs<FunctionLike>(context.nodes, Kind.FunctionDeclaration),
      ...ofKindAs<FunctionLike>(context.nodes, Kind.FunctionExpression),
      ...ofKindAs<FunctionLike>(context.nodes, Kind.ArrowFunction),
      ...ofKindAs<FunctionLike>(context.nodes, Kind.MethodDeclaration),
    ];

    await Promise.all(
      about.map(async (node) => {
        const isAsync = ((node.modifierFlags ?? 0) & ModifierFlags.Async) !== 0;
        if (!isAsync) return;

        // An `await` in the body settles it.
        if (awaitsSomething(node.body)) return;

        // A function that returns a promise is awaiting it by being
        // `async`. An arrow function with an expression body returns
        // that expression, so the body itself is the return.
        const returned = returnStatements(node.body);
        const candidates = [
          ...returned.map((statement) => statement.expression),
          node.body?.kind === Kind.Block ? undefined : node.body,
        ].filter((candidate): candidate is Node => candidate !== undefined);

        const promises = await Promise.all(
          candidates.map(async (candidate) =>
            isThenable(context.typeOf(candidate)),
          ),
        );
        if (promises.some(Boolean)) return;

        const name = node.name?.text;
        context.report(
          this.name,
          asyncKeyword(node) ?? node,
          `Async function${name ? ` '${name}'` : ""} has no 'await' expression.`,
        );
      }),
    );
  },
};

/**
 * The `async` keyword of a function, which is what the rule points at.
 */
function asyncKeyword(node: FunctionLike): Node | undefined {
  const modifiers = (node as { modifiers?: readonly Node[] }).modifiers;
  return modifiers?.find((modifier) => modifier.kind === Kind.AsyncKeyword);
}

/**
 * Does the function's body await anything?
 *
 * The walk stops at a nested function: an `await` inside a callback is not
 * an `await` of this function, and the nested function has its own rule to
 * answer.
 */
function awaitsSomething(body: Node | undefined): boolean {
  if (!body) return false;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;
    if (node.kind === Kind.AwaitExpression) {
      found = true;
      return;
    }
    // A `for await` is an await.
    if (node.kind === Kind.ForOfStatement) {
      const forOf = node as { awaitModifier?: Node };
      if (forOf.awaitModifier) {
        found = true;
        return;
      }
    }
    // A nested function has its own awaits.
    if (
      node.kind === Kind.FunctionDeclaration ||
      node.kind === Kind.FunctionExpression ||
      node.kind === Kind.ArrowFunction ||
      node.kind === Kind.MethodDeclaration
    ) {
      return;
    }
    node.forEachChild(walk);
  };

  walk(body);
  return found;
}

export const asyncRules: Rule[] = [requireAwait];
