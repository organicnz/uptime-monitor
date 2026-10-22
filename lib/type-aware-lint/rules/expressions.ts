import { isIdentifier, SyntaxKind } from "tsrs/unstable/ast";
import type {
  BinaryExpression,
  BindingElement,
  CallExpression,
  DeleteExpression,
  ElementAccessExpression,
  ForInStatement,
  Identifier,
  Node,
  PrefixUnaryExpression,
  PropertyAccessExpression,
  TemplateSpan,
  ThrowStatement,
  VariableDeclaration,
} from "tsrs/unstable/ast";

import {
  isAny,
  isArrayType,
  isBigIntLike,
  isBooleanLike,
  isErrorLike,
  isErrorType,
  isNever,
  isNonPrimitive,
  isNullish,
  isNumberLike,
  isObject,
  isStringLike,
  isUnknown,
  ofKind,
  typeName,
} from "../helpers";
import type { Type } from "../session";
import type { Rule } from "../types";

function ofKindAs<T extends Node>(
  nodes: { byKind: Map<number, Node[]> },
  kind: number,
): T[] {
  return ofKind(nodes, kind) as T[];
}

/**
 * The name a binding element binds.
 *
 * `const { method: alias } = object` binds `alias`, and the method it
 * holds is `method`.
 */
function bindingElementName(element: BindingElement): string | undefined {
  const property = element.propertyName;
  if (property && "text" in property) return property.text;
  if (element.name && "text" in element.name) return element.name.text;
  return undefined;
}

/**
 * `restrict-plus-operands`: `+` on something that is not a number.
 *
 * `+` is addition on numbers and concatenation on strings, so an operand
 * of any other type is either a mistake or a surprise. The compiler
 * rejects most of these, so the rule is the last line of defence.
 */
const restrictPlusOperands: Rule = {
  name: "@typescript-eslint/restrict-plus-operands",
  select(nodes) {
    const about = ofKindAs<BinaryExpression>(
      nodes,
      SyntaxKind.BinaryExpression,
    ).filter((node) => node.operatorToken.kind === SyntaxKind.PlusToken);
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
    ).filter((node) => node.operatorToken.kind === SyntaxKind.PlusToken);

    await Promise.all(
      about.map(async (node) => {
        for (const operand of [node.left, node.right]) {
          const type = context.typeOf(operand);
          if (type === undefined) continue;
          if (isAny(type) || isUnknown(type) || isNever(type)) continue;
          // The compiler could not work out the type, so the rule has
          // nothing to say about it.
          if (isErrorType(type)) continue;
          if ((await isNumberLike(type)) || (await isStringLike(type))) {
            continue;
          }
          // A string may be concatenated with a boolean, a null, a regular
          // expression or an `undefined`.
          if (await isBooleanLike(type)) continue;
          // `object` is the type of anything that is not a primitive, and
          // it says nothing about how the value prints.
          if (isNonPrimitive(type)) continue;

          context.report(
            this.name,
            operand,
            `Invalid operand for a '+' operation. Operands must each be a number or string, allowing a string + any of: \`any\`, \`boolean\`, \`null\`, \`RegExp\`, \`undefined\`. Got \`${await typeName(context.checker, type)}\`.`,
          );
        }
      }),
    );
  },
};

/**
 * Is the expression something a template literal can print sensibly?
 *
 * A string, a number, a boolean and a bigint all print as themselves. A
 * union is printable when every one of its members is, because each of
 * them prints on its own.
 */
async function isPrintable(type: Type): Promise<boolean> {
  if (type.isUnionType()) {
    const constituents = await type.getTypes();
    const answers = await Promise.all(constituents.map(isPrintable));
    return answers.every(Boolean);
  }

  // An array prints as its elements, joined by commas.
  if (await isArrayType(type)) return true;

  return (
    (await isStringLike(type)) ||
    (await isNumberLike(type)) ||
    (await isBooleanLike(type)) ||
    (await isBigIntLike(type))
  );
}

/**
 * `restrict-template-expressions`: something that is not a string inside a
 * template literal.
 *
 * A template literal calls `toString` on whatever it is given, and the
 * result can be `[object Object]`.
 */
const restrictTemplateExpressions: Rule = {
  name: "@typescript-eslint/restrict-template-expressions",
  select(nodes) {
    const about = ofKindAs<TemplateSpan>(nodes, SyntaxKind.TemplateSpan);
    return { about, wanted: about.map((node) => node.expression) };
  },
  async report(context) {
    const about = ofKindAs<TemplateSpan>(
      context.nodes,
      SyntaxKind.TemplateSpan,
    );

    await Promise.all(
      about.map(async (node) => {
        const type = context.typeOf(node.expression);
        if (type === undefined) return;
        if (isAny(type) || isUnknown(type)) return;
        if (isErrorType(type)) return;
        if (await isPrintable(type)) return;
        // `object` is the type of anything that is not a primitive, and
        // it says nothing about how it is printed.
        if (isNonPrimitive(type)) return;
        // A value that may be nullish prints as `undefined` or
        // `null`, which is what the author meant.
        if (await isNullish(type)) return;

        context.report(
          this.name,
          node.expression,
          `Invalid type "${await typeName(context.checker, type)}" of template literal expression.`,
        );
      }),
    );
  },
};

/**
 * `no-unsafe-unary-minus`: negating something that is not a number.
 *
 * `-` converts its operand to a number first, so a string that is not
 * numeric becomes `NaN`, and an object becomes `NaN` too.
 */
const noUnsafeUnaryMinus: Rule = {
  name: "@typescript-eslint/no-unsafe-unary-minus",
  select(nodes) {
    const about = ofKindAs<PrefixUnaryExpression>(
      nodes,
      SyntaxKind.PrefixUnaryExpression,
    ).filter((node) => node.operator === SyntaxKind.MinusToken);
    return { about, wanted: about.map((node) => node.operand) };
  },
  async report(context) {
    const about = ofKindAs<PrefixUnaryExpression>(
      context.nodes,
      SyntaxKind.PrefixUnaryExpression,
    ).filter((node) => node.operator === SyntaxKind.MinusToken);

    await Promise.all(
      about.map(async (node) => {
        const type = context.typeOf(node.operand);
        if (type === undefined) return;
        if (isAny(type) || isUnknown(type)) return;
        if (isErrorType(type)) return;
        if ((await isNumberLike(type)) || (await isBigIntLike(type))) {
          return;
        }

        context.report(
          this.name,
          node,
          `Argument of unary negation should be assignable to number | bigint but is "${await typeName(context.checker, type)}" instead.`,
        );
      }),
    );
  },
};

/**
 * `no-implied-eval`: a string handed to `setTimeout` or `setInterval`.
 *
 * The string is evaluated as code, so it is a remote code execution
 * waiting for a value that came from somewhere.
 */
const noImpliedEval: Rule = {
  name: "@typescript-eslint/no-implied-eval",
  select(nodes) {
    const about: Node[] = [];
    const wanted: Node[] = [];

    for (const call of ofKindAs<CallExpression>(
      nodes,
      SyntaxKind.CallExpression,
    )) {
      const callee = call.expression;
      if (callee.kind !== SyntaxKind.Identifier) continue;
      const name = (callee as Identifier).text;
      if (name !== "setTimeout" && name !== "setInterval") continue;

      about.push(call);
      const first = call.arguments[0];
      if (first) wanted.push(first);
    }

    return { about, wanted };
  },
  report(context) {
    const about = ofKindAs<CallExpression>(
      context.nodes,
      SyntaxKind.CallExpression,
    );

    for (const node of about) {
      const callee = node.expression;
      if (callee.kind !== SyntaxKind.Identifier) continue;
      const name = (callee as Identifier).text;
      if (name !== "setTimeout" && name !== "setInterval") continue;

      const first = node.arguments[0];
      if (!first) continue;
      if (first.kind !== SyntaxKind.StringLiteral) continue;

      context.report(
        this.name,
        first,
        "Implied eval. Consider passing a function.",
      );
    }
  },
};

/**
 * `no-array-delete`: `delete` on an array element.
 *
 * `delete` leaves a hole where the element was, so the array is no
 * longer contiguous and `forEach` skips the hole.
 */
const noArrayDelete: Rule = {
  name: "@typescript-eslint/no-array-delete",
  select(nodes) {
    const about = ofKindAs<DeleteExpression>(
      nodes,
      SyntaxKind.DeleteExpression,
    );
    const wanted: Node[] = [];
    for (const node of about) {
      // `delete list[0]` deletes from the array `list`, so the array is
      // the thing before the brackets.
      const operand = node.expression;
      const target =
        operand.kind === SyntaxKind.ElementAccessExpression
          ? (operand as ElementAccessExpression).expression
          : operand;
      wanted.push(target);
    }
    return { about, wanted };
  },
  async report(context) {
    const about = ofKindAs<DeleteExpression>(
      context.nodes,
      SyntaxKind.DeleteExpression,
    );

    await Promise.all(
      about.map(async (node) => {
        const operand = node.expression;
        const target =
          operand.kind === SyntaxKind.ElementAccessExpression
            ? (operand as ElementAccessExpression).expression
            : operand;
        const type = context.typeOf(target);
        if (!(await isArrayType(type))) return;

        context.report(
          this.name,
          node,
          "Using the `delete` operator with an array expression is unsafe.",
        );
      }),
    );
  },
};

/**
 * `no-for-in-array`: `for ... in` over an array.
 *
 * `for ... in` walks the *keys* of an array, so it yields strings, and it
 * walks the prototype chain as well.
 */
const noForInArray: Rule = {
  name: "@typescript-eslint/no-for-in-array",
  select(nodes) {
    const about = ofKindAs<ForInStatement>(nodes, SyntaxKind.ForInStatement);
    return { about, wanted: about.map((node) => node.expression) };
  },
  async report(context) {
    const about = ofKindAs<ForInStatement>(
      context.nodes,
      SyntaxKind.ForInStatement,
    );

    await Promise.all(
      about.map(async (node) => {
        const type = context.typeOf(node.expression);
        if (!(await isArrayType(type))) return;

        context.report(
          this.name,
          node,
          "For-in loops over arrays skips holes, returns indices as strings, and may visit the prototype chain or other enumerable properties. Use a more robust iteration method such as for-of or array.forEach instead.",
        );
      }),
    );
  },
};

/**
 * `unbound-method`: a method taken off its object.
 *
 * `const { method } = object` loses the `this` the method was called on,
 * so the method sees `undefined` where it expected the object.
 *
 * The rule only applies to a method that does not declare `this: void`.
 * A function that does not care about its receiver can be taken off the
 * object as freely as anyone likes.
 */
const unboundMethod: Rule = {
  name: "@typescript-eslint/unbound-method",
  select(nodes) {
    const about: Node[] = [];
    const wanted: Node[] = [];

    for (const declaration of ofKindAs<VariableDeclaration>(
      nodes,
      SyntaxKind.VariableDeclaration,
    )) {
      const initializer = declaration.initializer;
      if (!initializer) continue;

      if (initializer.kind === SyntaxKind.PropertyAccessExpression) {
        about.push(declaration);
        wanted.push(initializer);
        continue;
      }

      // A destructuring pattern: `const { method } = object`.
      const name = declaration.name;
      if (name.kind !== SyntaxKind.ObjectBindingPattern) continue;
      for (const element of name.elements) {
        about.push(declaration);
        wanted.push(element);
      }
    }

    return { about, wanted };
  },
  async report(context) {
    const about = ofKindAs<VariableDeclaration>(
      context.nodes,
      SyntaxKind.VariableDeclaration,
    );

    await Promise.all(
      about.map(async (declaration) => {
        const initializer = declaration.initializer;
        if (!initializer) return;

        // The candidates are the method itself, and each element of a
        // destructuring pattern.
        const candidates: Node[] = [];
        if (initializer.kind === SyntaxKind.PropertyAccessExpression) {
          candidates.push(initializer);
        } else {
          const name = declaration.name;
          if (name.kind !== SyntaxKind.ObjectBindingPattern) return;
          for (const element of name.elements) candidates.push(element);
        }

        await Promise.all(
          candidates.map(async (candidate) => {
            const type = context.typeOf(candidate);
            if (type === undefined) return;
            if (isAny(type)) return;

            // A method that does not declare `this: void` needs a
            // receiver. The compiler does not materialise the implicit
            // `this` of a method as a parameter, so the declaration is
            // what says: a method is a class member, and a class member
            // has a `this` unless it says otherwise.
            const signatures = await type.getCallSignatures();
            if (signatures.length === 0) return;

            const usesThis = await Promise.all(
              signatures.map((signature) => {
                // `this: void` means the method does not care.
                if (signature.thisParameter !== undefined) return false;
                const declaration = signature.declaration;
                if (!declaration) return false;
                return (
                  declaration.kind === SyntaxKind.MethodDeclaration ||
                  declaration.kind === SyntaxKind.MethodSignature
                );
              }),
            );
            if (!usesThis.some(Boolean)) return;

            const text =
              candidate.kind === SyntaxKind.BindingElement
                ? bindingElementName(candidate as BindingElement)
                : (candidate as PropertyAccessExpression).name?.text;
            if (!text) return;

            context.report(
              this.name,
              candidate,
              "A method that is not declared with `this: void` may cause unintentional scoping of `this` when separated from its object.\nConsider using an arrow function or explicitly `.bind()`ing the method to avoid calling the method with an unintended `this` value. \nIf a function does not access `this`, it can be annotated with `this: void`.",
            );
          }),
        );
      }),
    );
  },
};

/**
 * `only-throw-error`: throwing something that is not an error.
 *
 * A thrown value that is not an `Error` has no stack, so the thing that
 * failed cannot be found in the logs.
 */
const onlyThrowError: Rule = {
  name: "@typescript-eslint/only-throw-error",
  select(nodes) {
    const about = ofKindAs<ThrowStatement>(nodes, SyntaxKind.ThrowStatement);
    return { about, wanted: about.map((node) => node.expression) };
  },
  async report(context) {
    const about = ofKindAs<ThrowStatement>(
      context.nodes,
      SyntaxKind.ThrowStatement,
    );

    await Promise.all(
      about.map(async (node) => {
        const type = context.typeOf(node.expression);
        if (isAny(type) || isUnknown(type)) return;
        if (await isErrorLike(type)) return;

        context.report(
          this.name,
          node.expression,
          "Expected an error object to be thrown.",
        );
      }),
    );
  },
};

/**
 * `no-base-to-string`: stringifying an object through `Object.prototype`.
 *
 * `String({})` is `"[object Object]"`, which is never what the author
 * meant. The check is on where the `toString` comes from: a type that
 * declares its own `toString` is fine, and a type that inherits
 * `Object.prototype.toString` is not.
 */
const noBaseToString: Rule = {
  name: "@typescript-eslint/no-base-to-string",
  select(nodes) {
    const about: Node[] = [];
    const wanted: Node[] = [];

    for (const call of ofKindAs<CallExpression>(
      nodes,
      SyntaxKind.CallExpression,
    )) {
      const callee = call.expression;
      if (callee.kind !== SyntaxKind.Identifier) continue;
      if ((callee as Identifier).text !== "String") continue;

      about.push(call);
      const first = call.arguments[0];
      if (first) wanted.push(first);
    }

    // A template literal prints its expressions the same way.
    for (const span of ofKindAs<TemplateSpan>(nodes, SyntaxKind.TemplateSpan)) {
      about.push(span);
      wanted.push(span.expression);
    }

    return { about, wanted };
  },
  async report(context) {
    const about = [
      ...ofKindAs<CallExpression>(context.nodes, SyntaxKind.CallExpression),
      ...ofKindAs<TemplateSpan>(context.nodes, SyntaxKind.TemplateSpan),
    ];

    await Promise.all(
      about.map(async (node) => {
        // The expression being printed. `String(x)` prints its argument;
        // a template literal prints its expression.
        let printed: Node | undefined;
        if (node.kind === SyntaxKind.TemplateSpan) {
          printed = node.expression;
        } else {
          const callee = node.expression;
          if (!isIdentifier(callee)) return;
          if (callee.text !== "String") return;
          printed = node.arguments[0];
        }
        if (!printed) return;

        const type = context.typeOf(printed);
        if (type === undefined) return;
        if (isAny(type) || isUnknown(type)) return;

        // Only an object can print as `[object Object]`. A string prints
        // as itself, and a function prints as its source.
        if (!isObject(type) && !isNonPrimitive(type)) return;
        const signatures = await type.getCallSignatures();
        if (signatures.length > 0) return;

        // The type's own `toString` is the one that was written for it.
        const own = await type.getProperties();
        if (own.some((property) => property.name === "toString")) return;

        const toString = await type.getProperty("toString");
        if (toString === undefined) return;

        context.report(
          this.name,
          printed,
          `'${printed.getText?.() ?? ""}' will use Object's default stringification format ('[object Object]') when stringified.`,
        );
      }),
    );
  },
};

export const expressionRules: Rule[] = [
  restrictPlusOperands,
  restrictTemplateExpressions,
  noUnsafeUnaryMinus,
  noImpliedEval,
  noArrayDelete,
  noForInArray,
  unboundMethod,
  onlyThrowError,
  noBaseToString,
];
