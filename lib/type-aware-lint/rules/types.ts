import { SyntaxKind } from "tsrs/unstable/ast";
import type { Node, UnionTypeNode } from "tsrs/unstable/ast";

import { ofKind } from "../helpers";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/** The text of a type node, for the comparison. */
function typeText(node: Node): string {
  return node.getText?.() ?? "";
}

/**
 * `no-duplicate-type-constituents`: the same type twice in a union.
 *
 * `string | string` is `string`. The duplicate is usually a mistake, and
 * it is invisible when the union is written across several lines.
 */
const noDuplicateTypeConstituents: Rule = {
  name: "@typescript-eslint/no-duplicate-type-constituents",
  select(nodes) {
    const about = ofKindAs<UnionTypeNode>(nodes, SyntaxKind.UnionType);
    return { about, wanted: [] };
  },
  report(context) {
    for (const node of ofKindAs<UnionTypeNode>(
      context.nodes,
      SyntaxKind.UnionType,
    )) {
      const seen = new Set<string>();
      for (const member of node.types) {
        const text = typeText(member);
        if (seen.has(text)) {
          context.report(
            this.name,
            member,
            `Duplicate type constituent '${text}'.`,
          );
          continue;
        }
        seen.add(text);
      }
    }
  },
};

/**
 * `no-redundant-type-constituents`: a member a union does not need.
 *
 * `unknown` swallows every other member, and `never` is the empty set, so
 * a union with either of them is just the other members.
 */
const noRedundantTypeConstituents: Rule = {
  name: "@typescript-eslint/no-redundant-type-constituents",
  select(nodes) {
    const about = ofKindAs<UnionTypeNode>(nodes, SyntaxKind.UnionType);
    return { about, wanted: [] };
  },
  report(context) {
    for (const node of ofKindAs<UnionTypeNode>(
      context.nodes,
      SyntaxKind.UnionType,
    )) {
      if (node.types.length < 2) continue;

      const texts = node.types.map(typeText);
      const unknown = texts.indexOf("unknown");
      if (unknown !== -1) {
        context.report(
          this.name,
          node.types[unknown],
          "`unknown` is redundant in a union with other types.",
        );
        continue;
      }

      const never = texts.indexOf("never");
      if (never !== -1) {
        context.report(
          this.name,
          node.types[never],
          "`never` is redundant in a union with other types.",
        );
      }
    }
  },
};

export const typeRules: Rule[] = [
  noDuplicateTypeConstituents,
  noRedundantTypeConstituents,
];
