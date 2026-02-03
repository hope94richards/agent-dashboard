import { getDb, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("select * from schedules order by run_at_epoch asc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const id = crypto.randomUUID();
  const runAt = body.run_at || null;
  const runAtEpoch = runAt ? Date.parse(runAt) : null;
  const createdAt = nowIso();

  db.prepare(
    `insert into schedules (id, title, project, run_at, run_at_epoch, created_at)
     values (@id, @title, @project, @run_at, @run_at_epoch, @created_at)`
  ).run({
    id,
    title: body.title,
    project: body.project ?? null,
    run_at: runAt,
    run_at_epoch: runAtEpoch,
    created_at: createdAt
  });

  return NextResponse.json({ id });
}
