import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("select * from notes order by updated_at desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const id = crypto.randomUUID();
  const now = nowIso();
  db.prepare(
    `insert into notes (id, body, created_at, updated_at)
     values (@id, @body, @created_at, @updated_at)`
  ).run({
    id,
    body: body.body,
    created_at: now,
    updated_at: now
  });
  logEvent({ entity: "note", entityId: id, type: "note.created", actor: body.actor ?? "Agent", payload: body });
  return NextResponse.json({ id });
}
