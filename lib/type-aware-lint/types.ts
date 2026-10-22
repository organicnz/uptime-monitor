import type { Node } from "tsrs/unstable/ast";

import type { Checker, Type } from "./session";

/**
 * The shapes the type-aware lint speaks.
 *
 * A finding is a rule name, a place, and a sentence. The rule name is the
 * one the linter it replaces used, so a reader who knows the old output
 * knows the new one, and so a rule that stops firing is visible in a diff.
 */

/** Where a finding is. */
export type Position = {
  /** The file, absolute. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
};

/** One thing wrong with the code. */
export type Finding = Position & {
  /** The rule that found it, named as the linter it replaces named it. */
  rule: string;
  /** The sentence. */
  message: string;
};

/**
 * The nodes of one file, grouped by syntax kind.
 *
 * The walk happens once for the whole file and every rule reads from the
 * same buckets. A walk costs about four tenths of a millisecond per file,
 * and there are more than twenty rules, so a walk per rule would be a
 * second of pure repetition.
 */
export type FileNodes = {
  /** The nodes of the file, by syntax kind. */
  byKind: Map<number, Node[]>;
};

/**
 * What a rule is given.
 *
 * The types are already resolved: the driver collects the nodes, asks the
 * checker for every type in one batch, and hands the rule a lookup. A rule
 * that wanted a type the driver did not collect would make a second round
 * trip per node, and there are tens of thousands of nodes.
 */
export type RuleContext = {
  /** The file being checked, absolute. */
  file: string;
  /** The nodes of the file, by syntax kind. */
  nodes: FileNodes;
  /** The type of a node, or `undefined` when the checker has none. */
  typeOf(node: Node): Type | undefined;
  /** The checker, for the questions a batch cannot answer. */
  checker: Checker;
  /** The text of the file, for the message. */
  text: string;
  /** Report a finding. */
  report(rule: string, node: Node, message: string): void;
};

/** One rule. */
export type Rule = {
  /** The name, as the linter it replaces named it. */
  name: string;
  /**
   * The nodes this rule is about, and the nodes whose types it needs.
   *
   * The driver asks every rule before it asks the checker anything, so the
   * types come back in one round trip. A type query costs a tenth of a
   * millisecond on its own and a hundredth of one in a batch, and there
   * are tens of thousands of nodes.
   */
  select(nodes: FileNodes): { about: Node[]; wanted: Node[] };
  /** The findings, once the types are in. */
  report(context: RuleContext): void | Promise<void>;
};
