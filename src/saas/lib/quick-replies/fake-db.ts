// Minimal in-memory stand-in for the slice of the Supabase query builder
// the quick-reply service uses (select / insert / update / delete, `.eq`
// filters, `.select()` after a write, `.single()` / `.maybeSingle()`).
// Test support only — not imported by application code. Embedded relations
// (`contact:contacts(...)`) are not resolved: put the embedded object
// directly on the row.

import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
type Op = 'select' | 'insert' | 'update' | 'delete';

export interface FakeDbOptions {
  /** Return a message to make that operation fail with `{ error }`. */
  failOn?: (table: string, op: Op) => string | null;
  /** Make deletes on this table match nothing (a concurrent request won). */
  deleteMatchesNothing?: (table: string) => boolean;
}

export function createFakeDb(
  tables: Record<string, Row[]>,
  options: FakeDbOptions = {}
): SupabaseClient {
  let seq = 0;

  function from(table: string) {
    const state: {
      op: Op;
      filters: Array<[string, unknown]>;
      values: Row | undefined;
      single: boolean;
      maybe: boolean;
    } = {
      op: 'select',
      filters: [],
      values: undefined,
      single: false,
      maybe: false,
    };

    const execute = (): {
      data: unknown;
      error: { message: string } | null;
    } => {
      const failure = options.failOn?.(table, state.op);
      if (failure) return { data: null, error: { message: failure } };

      tables[table] ??= [];
      const matched = tables[table].filter((r) =>
        state.filters.every(([k, v]) => r[k] === v)
      );
      let result: Row[] = matched;

      if (state.op === 'insert') {
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
      } else if (
        state.op === 'delete' &&
        options.deleteMatchesNothing?.(table)
      ) {
        result = [];
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
        state.filters.push([key, value]);
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
