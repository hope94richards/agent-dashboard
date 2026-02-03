import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const db = getDb();
  const body = await req.json();
  const now = nowIso();
  db.prepare(
    `update notes set
      body = coalesce(@body, body),
      updated_at = @updated_at
     where id = @id`
  ).run({
    id: params.id,
    body: body.body ?? null,
    updated_at: now
  });
  logEvent({ entity: "note", entityId: params.id, type: "note.updated", actor: body.actor ?? "Agent", payload: body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const db = getDb();
  db.prepare(`delete from notes where id = ?`).run(params.id);
  logEvent({ entity: "note", entityId: params.id, type: "note.deleted", actor: "Agent" });
  return NextResponse.json({ ok: true });
}
