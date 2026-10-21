import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * A fake Supabase client that records the queries it is asked to make.
 *
 * The point is not to be a database. It is to answer one question the
 * adapter's tests need answered: *which* query, with *which* filters, and
 * through *which* client. A query that forgets to filter by the owner, or
 * a credential read that goes through the wrong client, is invisible in
 * every other kind of test.
 *
 * It is a fake rather than a module mock on purpose: `mock.module` in Bun
 * is process-wide, and a test that replaced one would silently change what
 * every other test file sees.
 */

export type RecordedQuery = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

export type RecordedRpc = { name: string; args: unknown };

/** A scripted answer for one table or one RPC. */
export type Answers = Record<
  string,
  { data?: unknown; error?: { message: string } | null }
>;

export type FakeClient = {
  client: SupabaseClient<Database>;
  queries: RecordedQuery[];
  rpcs: RecordedRpc[];
  /** The queries of one kind, in order. */
  of: (op: RecordedQuery["op"]) => RecordedQuery[];
  /** The one query of a kind, or undefined. */
  one: (op: RecordedQuery["op"]) => RecordedQuery | undefined;
};

export function fakeClient(answers: Answers = {}): FakeClient {
  const queries: RecordedQuery[] = [];
  const rpcs: RecordedRpc[] = [];

  const answer = (key: string) => {
    const scripted = answers[key];
    return {
      data: scripted?.data ?? null,
      error: scripted?.error ?? null,
    };
  };

  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      // One array for the whole chain, shared with every query record, so
      // that the filters a query ends up with are the ones it was built
      // with.
      const filters: Array<[string, unknown]> = [];

      chain.select = (columns: unknown) => {
        queries.push({ table, op: "select", payload: columns, filters });
        return chain;
      };
      chain.insert = (row: unknown) => {
        queries.push({ table, op: "insert", payload: row, filters });
        return chain;
      };
      chain.update = (patch: unknown) => {
        queries.push({ table, op: "update", payload: patch, filters });
        return chain;
      };
      chain.delete = () => {
        queries.push({ table, op: "delete", filters });
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      };
      chain.in = (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      };
      chain.gte = (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.single = () => Promise.resolve(answer(table));
      chain.maybeSingle = () => Promise.resolve(answer(table));
      // A real query builder is thenable: awaiting it resolves to the
      // result, whether or not `.single()` was called on the way.
      chain.then = (
        resolve: (value: unknown) => unknown,
        _reject?: (reason: unknown) => unknown,
      ) => resolve(answer(table));

      return chain;
    },
    rpc: (name: string, args: unknown) => {
      rpcs.push({ name, args });
      return Promise.resolve(answer(name));
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    queries,
    rpcs,
    of: (op) => queries.filter((query) => query.op === op),
    one: (op) => queries.find((query) => query.op === op),
  };
}
