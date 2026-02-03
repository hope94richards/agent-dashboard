import { NextResponse } from "next/server";
import cron from "node-cron";
import { execSync } from "node:child_process";
import { getDb, nowIso } from "@/app/lib/db";

let started = false;

function syncCron() {
  const raw = execSync("/usr/local/bin/openclaw cron list --json", { encoding: "utf8" });
  const data = JSON.parse(raw);
  const jobs = data.jobs || [];

  const db = getDb();
  db.prepare("delete from schedules").run();

  const stmt = db.prepare(
    `insert into schedules (id, title, project, run_at, run_at_epoch, created_at)
     values (@id, @title, @project, @run_at, @run_at_epoch, @created_at)`
  );

  for (const job of jobs) {
    const runAtMs = job?.state?.nextRunAtMs || job?.schedule?.atMs || null;
    const runAt = runAtMs ? new Date(runAtMs).toISOString() : null;
    stmt.run({
      id: job.id,
      title: job.name || job.id,
      project: "OpenClaw",
      run_at: runAt,
      run_at_epoch: runAtMs,
      created_at: nowIso()
    });
  }
}

export async function POST() {
  if (!started) {
    cron.schedule("*/1 * * * *", () => {
      try { syncCron(); } catch {}
    });
    started = true;
    // initial sync
    try { syncCron(); } catch {}
  }
  return NextResponse.json({ ok: true, started });
}
