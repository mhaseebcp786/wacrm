// Minimal in-memory stand-in for the slice of the Supabase query builder the
// Welcome & Away code uses: select / insert / update / delete, the filters
// `.eq` `.neq` `.match` `.lt`, `.order` + `.limit`, `.select()` after a write and
// `.single()` / `.maybeSingle()`. Test support only — not imported by
// application code.
//
// An insert that repeats the table's `uniqueKey` columns fails with Postgres'
// unique-violation code (23505), which is what the claim guard relies on.
// Embedded relations (`contact:contacts(...)`) are not resolved: put the
// embedded object directly on the row.

import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';
type DbError = { message: string; code?: string };

export interface FakeDbOptions {
  /** Columns that must be unique together, per table. */
  uniqueKeys?: Record<string, string[]>;
  /** Return a message to make that operation fail with `{ error }`. */
  failOn?: (table: string, op: Op) => string | null;
}

export function createFakeDb(
  tables: Record<string, Row[]>,
  options: FakeDbOptions = {}
): SupabaseClient {
  let seq = 0;

  function from(table: string) {
    const state: {
      op: Op;
      filters: Array<(r: Row) => boolean>;
      values: Row | undefined;
      single: boolean;
      maybe: boolean;
      order?: { column: string; ascending: boolean };
      limit?: number;
    } = {
      op: 'select',
      filters: [],
      values: undefined,
      single: false,
      maybe: false,
    };

    const execute = (): { data: unknown; error: DbError | null } => {
      const failure = options.failOn?.(table, state.op);
      if (failure) return { data: null, error: { message: failure } };

      tables[table] ??= [];
      let matched = tables[table].filter((r) =>
        state.filters.every((f) => f(r))
      );
      if (state.order) {
        const { column, ascending } = state.order;
        matched = [...matched].sort((a, b) => {
          const cmp = String(a[column]).localeCompare(String(b[column]));
          return ascending ? cmp : -cmp;
        });
      }
      if (state.limit !== undefined) matched = matched.slice(0, state.limit);
      let result: Row[] = matched;

      if (state.op === 'insert') {
        const key = options.uniqueKeys?.[table];
        if (
          key &&
          tables[table].some((r) =>
            key.every((k) => r[k] === state.values?.[k])
          )
        ) {
          return {
            data: null,
            error: {
              message: `duplicate key value violates unique constraint on ${table}`,
              code: '23505',
            },
          };
        }
        const row: Row = {
          id: `id-${++seq}`,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          ...state.values,
        };
        tables[table].push(row);
        result = [row];
      } else if (state.op === 'update') {
        for (const r of matched) Object.assign(r, state.values);
      } else if (state.op === 'delete') {
        // In place, so a test holding the original array sees the removal.
        for (const r of matched) {
          tables[table].splice(tables[table].indexOf(r), 1);
        }
      }

      if (state.single || state.maybe) {
        const first = result[0] ?? null;
        if (!first && state.single) {
          return { data: null, error: { message: 'no rows' } };
        }
        return { data: first, error: null };
      }
      return { data: result, error: null };
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (values: Row) => {
        state.op = 'insert';
        state.values = values;
        return builder;
      },
      update: (values: Row) => {
        state.op = 'update';
        state.values = values;
        return builder;
      },
      delete: () => {
        state.op = 'delete';
        return builder;
      },
      eq: (key: string, value: unknown) => {
        state.filters.push((r) => r[key] === value);
        return builder;
      },
      match: (values: Row) => {
        state.filters.push((r) =>
          Object.entries(values).every(([k, v]) => r[k] === v)
        );
        return builder;
      },
      neq: (key: string, value: unknown) => {
        state.filters.push((r) => r[key] !== value);
        return builder;
      },
      lt: (key: string, value: string) => {
        state.filters.push((r) => String(r[key]) < value);
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.order = { column, ascending: opts?.ascending ?? true };
        return builder;
      },
      limit: (n: number) => {
        state.limit = n;
        return builder;
      },
      single: () => {
        state.single = true;
        return builder;
      },
      maybeSingle: () => {
        state.maybe = true;
        return builder;
      },
      then: (
        resolve: (v: ReturnType<typeof execute>) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve(execute()).then(resolve, reject),
    };
    return builder;
  }

  return { from } as unknown as SupabaseClient;
}
