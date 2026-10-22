import { SyntaxKind } from "tsrs/unstable/ast";
import type { BinaryExpression, Node } from "tsrs/unstable/ast";
import { SymbolFlags } from "tsrs/unstable/async";

import { isAny, isErrorType, isUnknown, ofKind } from "../helpers";
import type { Type } from "../session";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/** The literals of a type. */
type Literals = {
  values: (string | number | boolean | bigint)[];
  /** The enum the literals belong to, when they belong to one. */
  enumName: string | undefined;
};

/**
 * The name of the enum a type belongs to.
 *
 * A type is an enum when its symbol is one, and a member of an enum when
 * its symbol's parent is one. An enum with a single member has no union
 * at all — the type of its only member *is* the member — so the count of
 * the members says nothing.
 */
async function enumNameOf(type: Type): Promise<string | undefined> {
  // The members are asked, not the type. Narrowing an enum to exclude one
  // of its members leaves a union with no symbol of its own, and the
  // union is what the comparison is about.
  const members = type.isUnionType() ? await type.getTypes() : [type];

  for (const member of members) {
    const symbol = await member.getSymbol();
    if (!symbol) continue;

    if ((symbol.flags & SymbolFlags.Enum) !== 0) return symbol.name;

    const parent = await symbol.getParent();
    if (parent && (parent.flags & SymbolFlags.Enum) !== 0) return parent.name;
  }

  return undefined;
}

/**
 * The literals of a type, and the enum they belong to.
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

  return { values, enumName: await enumNameOf(type) };
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

        // One side has to be an enum, or a member of one.
        const leftIsEnum = leftLiterals.enumName !== undefined;
        const rightIsEnum = rightLiterals.enumName !== undefined;
        if (!leftIsEnum && !rightIsEnum) return;

        const members = leftIsEnum ? leftLiterals : rightLiterals;
        const other = leftIsEnum ? rightLiterals : leftLiterals;

        if (other.enumName !== undefined) {
          // Two enums: the comparison is only wrong when they are not the
          // same one.
          if (other.enumName === members.enumName) return;
        } else {
          // A value and an enum of the same kind: the comparison is
          // always false unless the value is one of the members.
          const kind = typeof members.values[0];
          if (typeof other.values[0] !== kind) return;
          if (other.values.every((value) => members.values.includes(value))) {
            return;
          }
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
