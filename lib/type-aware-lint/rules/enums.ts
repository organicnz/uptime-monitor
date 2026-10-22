import { SyntaxKind } from "tsrs/unstable/ast";
import type { BinaryExpression, Node } from "tsrs/unstable/ast";

import { isAny, isErrorType, isUnknown, ofKind } from "../helpers";
import type { Type } from "../session";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/** The values of a union of literal types. */
type Literals = {
  values: (string | number | boolean | bigint)[];
};

/**
 * The literals of a type.
 *
 * An enum is a union of literal types, one per member. A union of
 * literals that is not an enum is a union of literals, and comparing
 * those is ordinary.
 */
async function literalsOf(
  type: Type | undefined,
): Promise<Literals | undefined> {
  if (type === undefined) return undefined;

  const members = type.isUnionType() ? await type.getTypes() : [type];
  const values: (string | number | boolean | bigint)[] = [];

  for (const member of members) {
    if (!member.isLiteralType()) return undefined;
    values.push(member.value);
  }

  return { values };
}

/**
 * `no-unsafe-enum-comparison`: two values of the same kind that do not
 * share an enum type.
 *
 * The comparison is always false, so the code it guards is never
 * reached. The compiler catches the obvious cases; the rule catches the
 * ones where the enum comes from somewhere the compiler cannot see.
 */
const noUnsafeEnumComparison: Rule = {
  name: "@typescript-eslint/no-unsafe-enum-comparison",
  select(nodes) {
    const about = ofKindAs<BinaryExpression>(
      nodes,
      SyntaxKind.BinaryExpression,
    ).filter(
      (node) =>
        node.operatorToken.kind === SyntaxKind.EqualsEqualsEqualsToken ||
        node.operatorToken.kind === SyntaxKind.ExclamationEqualsEqualsToken,
    );
    const wanted: Node[] = [];
    for (const node of about) {
      wanted.push(node.left);
      wanted.push(node.right);
    }
    return { about, wanted };
  },
  async report(context) {
    const about = ofKindAs<BinaryExpression>(
      context.nodes,
      SyntaxKind.BinaryExpression,
    ).filter(
      (node) =>
        node.operatorToken.kind === SyntaxKind.EqualsEqualsEqualsToken ||
        node.operatorToken.kind === SyntaxKind.ExclamationEqualsEqualsToken,
    );

    await Promise.all(
      about.map(async (node) => {
        const left = context.typeOf(node.left);
        const right = context.typeOf(node.right);
        if (left === undefined || right === undefined) return;
        if (isAny(left) || isUnknown(left)) return;
        if (isAny(right) || isUnknown(right)) return;
        // The compiler could not work out the type, so the rule has
        // nothing to say about it.
        if (isErrorType(left) || isErrorType(right)) return;

        const leftLiterals = await literalsOf(left);
        const rightLiterals = await literalsOf(right);
        if (!leftLiterals || !rightLiterals) return;

        // One side has to be an enum — a union of its members — and the
        // other a value that is not one of them. A single member is not
        // an enum: comparing two members of the same enum is ordinary.
        const leftIsEnum = leftLiterals.values.length > 1;
        const rightIsEnum = rightLiterals.values.length > 1;
        if (!leftIsEnum && !rightIsEnum) return;
        if (leftIsEnum && rightIsEnum) return;

        const members = leftIsEnum ? leftLiterals : rightLiterals;
        const other = leftIsEnum ? rightLiterals : leftLiterals;

        // A value and an enum of the same kind: the comparison is always
        // false unless the value is one of the members.
        const kind = typeof members.values[0];
        if (typeof other.values[0] !== kind) return;
        if (other.values.every((value) => members.values.includes(value))) {
          return;
        }

        context.report(
          this.name,
          node,
          "The two values in this comparison do not have a shared enum type.",
        );
      }),
    );
  },
};

export const enumRules: Rule[] = [noUnsafeEnumComparison];
