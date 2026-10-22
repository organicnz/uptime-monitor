import type { Node, SourceFile } from "tsrs/unstable/ast";
import { API } from "tsrs/unstable/async";
import type { Checker, Type } from "tsrs/unstable/async";

export type { Checker, Type };

/**
 * The tsrs session: one compiler, one program, one checker.
 *
 * The type information comes from `tsrs`, which is the only type checker in
 * this repository. It is the Rust port of the TypeScript 7 compiler, and
 * it is exposed here through its Node API — the same program the `tsrs
 * --noEmit` gate checks the project with.
 *
 * The API has a synchronous and an asynchronous client. The synchronous one
 * reads the child's stdout through a Node.js internal (`stdout._handle.fd`),
 * which Bun does not have, so this uses the asynchronous one: JSON-RPC over
 * the same stdio, without the Node.js assumption.
 */

/** A symbol, as the tsrs API exposes it. */
export type Symbol = Awaited<ReturnType<Checker["getPropertyOfType"]>>;

export type Session = {
  /** Every file in the program, in the order the compiler lists them. */
  files(): Promise<readonly string[]>;
  /** The AST of one file. */
  sourceFile(path: string): Promise<SourceFile | undefined>;
  /** The type of every node, in one round trip. */
  typesOf(nodes: readonly Node[]): Promise<(Type | undefined)[]>;
  /** The checker, for the questions a batch cannot answer. */
  readonly checker: Checker;
  /** Shut the server down. */
  close(): Promise<void>;
};

/**
 * Open a session on a project.
 *
 * The server is a child process, and it is the same binary the gate runs,
 * so there is no second compiler anywhere in the chain.
 */
export async function openSession(
  cwd: string,
  tsconfigPath: string,
): Promise<Session> {
  const api = new API({ cwd });
  const snapshot = await api.createSnapshot({ openProject: tsconfigPath });
  const project = snapshot.getConfiguredProject(tsconfigPath);
  if (!project) {
    throw new Error(`tsrs did not configure a project for ${tsconfigPath}`);
  }

  const program = project.program;
  const checker = project.checker;

  return {
    files: () => program.getSourceFileNames(),
    sourceFile: (path) => program.getSourceFile(path),
    typesOf: async (nodes) => {
      if (nodes.length === 0) return [];
      const types = await checker.getTypeAtLocation(nodes);
      return types.map((type) => type ?? undefined);
    },
    checker,
    close: async () => {
      await api.close?.();
    },
  };
}
