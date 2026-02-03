import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR = path.join(process.env.HOME || "", ".openclaw/workspace/agent-dashboard/apps/web/data");
const DATA_DIR = process.env.AGENT_DASHBOARD_DATA_DIR || DEFAULT_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, "board.db");

let db: Database.Database | null = null;

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.exec(`
    create table if not exists tasks (
      id text primary key,
      title text not null,
      project text,
      status text not null,
      date text,
      priority integer not null,
      description text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists deliverables (
      id text primary key,
      title text not null,
      type text,
      date text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists notes (
      id text primary key,
      body text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists events (
      id text primary key,
      entity text not null,
      entity_id text,
      type text not null,
      actor text,
      payload text,
      ts text not null,
      ts_epoch integer not null
    );

    create table if not exists schedules (
      id text primary key,
      title text not null,
      project text,
      run_at text,
      run_at_epoch integer,
      created_at text not null
    );

    create index if not exists idx_events_ts on events(ts_epoch);
    create index if not exists idx_tasks_status on tasks(status);
    create index if not exists idx_schedules_run_at on schedules(run_at_epoch);
  `);

  const taskCols = instance.prepare("pragma table_info(tasks)").all().map((c: any) => c.name);
  if (!taskCols.includes("priority")) {
    instance.exec("alter table tasks add column priority integer");
  }
  if (!taskCols.includes("description")) {
    instance.exec("alter table tasks add column description text");
  }
  if (taskCols.includes("description_long")) {
    instance.exec("update tasks set description = coalesce(description, description_long)");
  }

  const eventCols = instance.prepare("pragma table_info(events)").all().map((c: any) => c.name);
  if (!eventCols.includes("actor")) {
    instance.exec("alter table events add column actor text");
  }
  instance.exec("update events set actor = 'Agent' where actor is null");

  return instance;
}

export function getDb() {
  if (!db) db = init();
  return db;
}

export function nowIso() {
  return new Date().toISOString();
}

export function nowEpoch() {
  return Date.now();
}

export function logEvent(params: {
  entity: string;
  entityId?: string | null;
  type: string;
  actor?: string | null;
  payload?: any;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const ts = nowIso();
  const ts_epoch = nowEpoch();
  db.prepare(
    `insert into events (id, entity, entity_id, type, actor, payload, ts, ts_epoch)
     values (@id, @entity, @entity_id, @type, @actor, @payload, @ts, @ts_epoch)`
  ).run({
    id,
    entity: params.entity,
    entity_id: params.entityId ?? null,
    type: params.type,
    actor: params.actor ?? "Agent",
    payload: params.payload ? JSON.stringify(params.payload) : null,
    ts,
    ts_epoch
  });
}

// status_state removed; status is now derived from events
