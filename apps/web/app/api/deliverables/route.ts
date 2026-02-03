import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("select * from deliverables order by updated_at desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const id = crypto.randomUUID();
  const now = nowIso();
  db.prepare(
    `insert into deliverables (id, title, type, date, created_at, updated_at)
     values (@id, @title, @type, @date, @created_at, @updated_at)`
  ).run({
    id,
    title: body.title,
    type: body.type ?? null,
    date: body.date ?? null,
    created_at: now,
    updated_at: now
  });
  logEvent({ entity: "deliverable", entityId: id, type: "deliverable.created", actor: body.actor ?? "Agent", payload: body });
  return NextResponse.json({ id });
}
