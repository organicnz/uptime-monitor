import { SyntaxKind } from "tsrs/unstable/ast";
import type { AsExpression, Node, TypeAssertion } from "tsrs/unstable/ast";

import { ofKind } from "../helpers";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/**
 * `no-unnecessary-type-assertion`: an assertion that changes nothing.
 *
 * The assertion says "this is a `string`" about a value that is already a
 * `string`. It says nothing, and it costs a reader the question of what it
 * was for.
 *
 * The comparison is on the type itself: the assertion is unnecessary when
 * the value already has the type the assertion names. A judgement about
 * two *different* types that happen to be interchangeable is left to the
 * reader, because the answer depends on the context the assertion sits
 * in, and a rule that guesses at the context reports assertions that are
 * not unnecessary.
 */
const noUnnecessaryTypeAssertion: Rule = {
  name: "@typescript-eslint/no-unnecessary-type-assertion",
  select(nodes) {
    const about = [
      ...ofKindAs<AsExpression>(nodes, SyntaxKind.AsExpression),
      ...ofKindAs<TypeAssertion>(nodes, SyntaxKind.TypeAssertionExpression),
    ];
    const wanted: Node[] = [];
    for (const node of about) {
      wanted.push(node.expression);
      wanted.push(node.type);
    }
    return { about, wanted };
  },
  report(context) {
    const about = [
      ...ofKindAs<AsExpression>(context.nodes, SyntaxKind.AsExpression),
      ...ofKindAs<TypeAssertion>(
        context.nodes,
        SyntaxKind.TypeAssertionExpression,
      ),
    ];

    for (const node of about) {
      // `as const` is not a type assertion at all: it asks for the
      // literal types and the readonly-ness, and the type it produces is
      // narrower than the one it replaces.
      if (isConstAssertion(node.type)) continue;

      const asserted = context.typeOf(node.type);
      const actual = context.typeOf(node.expression);
      if (asserted === undefined || actual === undefined) continue;
      if (asserted.id !== actual.id) continue;

      context.report(
        this.name,
        node,
        "This assertion is unnecessary since it does not change the type of the expression.",
      );
    }
  },
};

/** Is the type node an `as const`? */
function isConstAssertion(node: Node): boolean {
  if (node.kind !== SyntaxKind.TypeReference) return false;
  const reference = node as { typeName?: Node };
  const name = reference.typeName;
  if (!name || name.kind !== SyntaxKind.Identifier) return false;
  return (name as { text?: string }).text === "const";
}

export const assertionRules: Rule[] = [noUnnecessaryTypeAssertion];
