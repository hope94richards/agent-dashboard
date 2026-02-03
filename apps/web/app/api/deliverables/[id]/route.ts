import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const db = getDb();
  const body = await req.json();
  const now = nowIso();
  db.prepare(
    `update deliverables set
      title = coalesce(@title, title),
      type = coalesce(@type, type),
      date = coalesce(@date, date),
      updated_at = @updated_at
     where id = @id`
  ).run({
    id: params.id,
    title: body.title ?? null,
    type: body.type ?? null,
    date: body.date ?? null,
    updated_at: now
  });
  logEvent({ entity: "deliverable", entityId: params.id, type: "deliverable.updated", actor: body.actor ?? "Agent", payload: body });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const db = getDb();
  db.prepare(`delete from deliverables where id = ?`).run(params.id);
  logEvent({ entity: "deliverable", entityId: params.id, type: "deliverable.deleted", actor: "Agent" });
  return NextResponse.json({ ok: true });
}
