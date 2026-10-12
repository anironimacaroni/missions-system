import { Pool, types, type QueryResultRow } from "pg";

// תאריכים (DATE) חוזרים כמחרוזת YYYY-MM-DD ולא כאובייקט Date, כדי למנוע הזזות אזור זמן
types.setTypeParser(1082, (v) => v);

const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __schema?: Promise<void>;
};

function getPool(): Pool {
  if (globalForDb.__pool) return globalForDb.__pool;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL לא מוגדר");
  }
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);
  const hasSslMode = /[?&]sslmode=/.test(url);
  globalForDb.__pool = new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
    ssl: isLocal || hasSslMode ? undefined : { rejectUnauthorized: false },
  });
  return globalForDb.__pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B7BEA',
  view text NOT NULL DEFAULT 'kanban',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'task',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  due_date date,
  position double precision NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_space_idx ON tasks(space_id);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope jsonb NOT NULL,
  ops jsonb NOT NULL,
  kind text NOT NULL,
  count integer NOT NULL,
  summary text NOT NULL,
  sample jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts(ip, at);
`;

export function ensureSchema(): Promise<void> {
  if (!globalForDb.__schema) {
    globalForDb.__schema = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        globalForDb.__schema = undefined;
        throw err;
      });
  }
  return globalForDb.__schema;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function closePool(): Promise<void> {
  if (globalForDb.__pool) {
    await globalForDb.__pool.end();
    globalForDb.__pool = undefined;
    globalForDb.__schema = undefined;
  }
}
