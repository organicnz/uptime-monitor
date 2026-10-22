import { SyntaxKind } from "tsrs/unstable/ast";
import type {
  BinaryExpression,
  CallExpression,
  Expression,
  Identifier,
  Node,
  PropertyAccessExpression,
  ReturnStatement,
  VariableDeclaration,
} from "tsrs/unstable/ast";

import { isAny, isUnknown, ofKind, typeName } from "../helpers";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/** Is this node an assignment — an `=` that is not part of a comparison? */
function isAssignment(node: BinaryExpression): boolean {
  return node.operatorToken.kind === SyntaxKind.EqualsToken;
}

/**
 * The function a statement belongs to.
 *
 * The walk stops at the first function-like node, because a return inside
 * a callback belongs to the callback.
 */
function enclosingFunction(node: Node): Node | undefined {
  let current = node.parent;
  while (current) {
    if (
      current.kind === SyntaxKind.FunctionDeclaration ||
      current.kind === SyntaxKind.FunctionExpression ||
      current.kind === SyntaxKind.ArrowFunction ||
      current.kind === SyntaxKind.MethodDeclaration ||
      current.kind === SyntaxKind.GetAccessor ||
      current.kind === SyntaxKind.SetAccessor
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * The `no-unsafe-*` family: an `any` that came off the network, and the
 * places it does damage.
 *
 * The compiler is silent about all of these. An `any` is assignable to
 * everything, so a mistake three calls away from where the `any` was
 * introduced is not a type error — it is a runtime surprise. The rules
 * find the `any` at the point it enters and at the points it does harm.
 */

/**
 * `no-unsafe-assignment`: an `any` assigned to something that has a type.
 *
 * The target matters. An `any` assigned to another `any` loses nothing;
 * an `any` assigned to a `string` is where the type information goes.
 */
const noUnsafeAssignment: Rule = {
  name: "@typescript-eslint/no-unsafe-assignment",
  select(nodes) {
    const about: Node[] = [];
    const wanted: Node[] = [];

    for (const declaration of ofKindAs<VariableDeclaration>(
      nodes,
      SyntaxKind.VariableDeclaration,
    )) {
      if (!declaration.initializer) continue;
      about.push(declaration);
      wanted.push(declaration.initializer);
      // The annotation says what the variable is holding, and a target
      // that takes `unknown` is the safe place for an `any` to land.
      if (declaration.type) wanted.push(declaration.type);
    }

    for (const expression of ofKindAs<BinaryExpression>(
      nodes,
      SyntaxKind.BinaryExpression,
    )) {
      if (!isAssignment(expression)) continue;
      about.push(expression);
      wanted.push(expression.right);
      wanted.push(expression.left);
    }

    return { about, wanted };
  },
  report(context) {
    for (const node of ofKindAs<VariableDeclaration>(
      context.nodes,
      SyntaxKind.VariableDeclaration,
    )) {
      if (!node.initializer) continue;

      const value = context.typeOf(node.initializer);
      if (!isAny(value)) continue;

      // A variable declared as `any` is saying so, and an `any` assigned
      // to it loses nothing. A variable declared as `unknown` is the
      // safe place for an `any` to land. A variable with no annotation
      // is inferred, and the inference is `any` — which is the hazard.
      if (node.type) {
        const declared = context.typeOf(node.type);
        if (isAny(declared) || isUnknown(declared)) continue;
      }

      context.report(this.name, node, "Unsafe assignment of an `any` value.");
    }

    for (const node of ofKindAs<BinaryExpression>(
      context.nodes,
      SyntaxKind.BinaryExpression,
    )) {
      if (!isAssignment(node)) continue;

      const value = context.typeOf(node.right);
      if (!isAny(value)) continue;
      // An `any` assigned to an `any` loses nothing, and a target that
      // takes `unknown` is the safe place for an `any` to land.
      const target = context.typeOf(node.left);
      if (isAny(target) || isUnknown(target)) continue;

      context.report(
        this.name,
        node.right,
        "Unsafe assignment of an `any` value.",
      );
    }
  },
};

/**
 * `no-unsafe-member-access`: reading a member of an `any`.
 *
 * The object is the `any`, not the member: `data.thing` is safe when
 * `data` has a type, and it is a guess when `data` is `any`.
 */
const noUnsafeMemberAccess: Rule = {
  name: "@typescript-eslint/no-unsafe-member-access",
  select(nodes) {
    const about = ofKindAs<PropertyAccessExpression>(
      nodes,
      SyntaxKind.PropertyAccessExpression,
    );
    return { about, wanted: about.map((node) => node.expression) };
  },
  report(context) {
    for (const node of ofKindAs<PropertyAccessExpression>(
      context.nodes,
      SyntaxKind.PropertyAccessExpression,
    )) {
      const object = context.typeOf(node.expression);
      if (!isAny(object)) continue;

      const name = node.name?.text ?? "member";
      context.report(
        this.name,
        node.name ?? node,
        `Unsafe member access .${name} on an \`any\` value.`,
      );
    }
  },
};

/**
 * `no-unsafe-return`: an `any` handed back to the caller.
 *
 * A function that returns `any` takes the burden off its callers and
 * puts it on them: every caller is now working with `any` too. A function
 * that *declares* `any` as its return type is saying so, and that is
 * not a surprise.
 */
const noUnsafeReturn: Rule = {
  name: "@typescript-eslint/no-unsafe-return",
  select(nodes) {
    const about = ofKindAs<ReturnStatement>(nodes, SyntaxKind.ReturnStatement);
    const wanted: Node[] = [];
    for (const node of about) {
      if (node.expression) wanted.push(node.expression);
    }
    return { about, wanted };
  },
  report(context) {
    for (const node of ofKindAs<ReturnStatement>(
      context.nodes,
      SyntaxKind.ReturnStatement,
    )) {
      if (!node.expression) continue;
      const value = context.typeOf(node.expression);
      if (!isAny(value)) continue;

      // A function that declares `any` as its return type is saying so.
      const owner = enclosingFunction(node);
      const declared = (owner as { type?: Node } | undefined)?.type;
      if (declared) {
        const declaredType = context.typeOf(declared);
        if (isAny(declaredType)) continue;
      }

      context.report(
        this.name,
        node,
        "Unsafe return of a value of type `any`.",
      );
    }
  },
};

/**
 * `no-unsafe-call`: calling an `any`.
 *
 * The callee is `any`, so the arguments are unchecked, the return value
 * is `any`, and the call can be to anything.
 */
const noUnsafeCall: Rule = {
  name: "@typescript-eslint/no-unsafe-call",
  select(nodes) {
    const about = ofKindAs<CallExpression>(nodes, SyntaxKind.CallExpression);
    return { about, wanted: about.map((node) => node.expression) };
  },
  report(context) {
    for (const node of ofKindAs<CallExpression>(
      context.nodes,
      SyntaxKind.CallExpression,
    )) {
      // A dynamic import is not a call to an `any`: the module is
      // whatever it exports.
      if (node.expression.kind === SyntaxKind.ImportKeyword) continue;

      const callee = context.typeOf(node.expression);
      if (!isAny(callee)) continue;

      context.report(this.name, node, "Unsafe call of an `any` typed value.");
    }
  },
};

/**
 * `no-unsafe-argument`: an `any` handed to a function that wanted a type.
 *
 * The argument is `any`; the parameter is not. The call compiles, and the
 * function does whatever it does with the value.
 */
const noUnsafeArgument: Rule = {
  name: "@typescript-eslint/no-unsafe-argument",
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
        const anyArguments = node.arguments.filter((argument) =>
          isAny(context.typeOf(argument)),
        );
        if (anyArguments.length === 0) return;

        const signature = await context.checker.getResolvedSignature(node);

        await Promise.all(
          anyArguments.map(async (argument) => {
            const index = node.arguments.indexOf(argument);
            if (index < 0) return;
            const parameterType = await context.checker.getParameterType(
              signature,
              index,
            );
            if (parameterType === undefined) return;
            if (isAny(parameterType)) return;
            // A parameter that takes `unknown` takes anything, so an
            // `any` argument is not unsafe there.
            if (isUnknown(parameterType)) return;

            context.report(
              this.name,
              argument,
              `Unsafe argument of type \`any\` assigned to a parameter of type \`${await typeName(context.checker, parameterType)}\`.`,
            );
          }),
        );
      }),
    );
  },
};

export const unsafeRules: Rule[] = [
  noUnsafeAssignment,
  noUnsafeMemberAccess,
  noUnsafeReturn,
  noUnsafeCall,
  noUnsafeArgument,
];

/** Kept for the rules that read an expression's name. */
export type { Expression, Identifier };
