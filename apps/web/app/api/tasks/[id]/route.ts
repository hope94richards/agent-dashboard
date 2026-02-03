import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const db = getDb();
  const body = await req.json();
  const now = nowIso();
  const { id } = await Promise.resolve(params);
  if (body.status && !["todo", "blocked", "in_progress", "done", "archived"].includes(body.status)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }
  if (body.priority !== undefined && Number.isNaN(Number(body.priority))) {
    return NextResponse.json({ error: "Priority must be a number" }, { status: 400 });
  }
  if (body.title === "" || body.project === "" || body.description === "") {
    return NextResponse.json({ error: "Required fields cannot be empty" }, { status: 400 });
  }
  const info = db.prepare(
    `update tasks set
      title = coalesce(@title, title),
      project = coalesce(@project, project),
      status = coalesce(@status, status),
      date = coalesce(@date, date),
      priority = coalesce(@priority, priority),
      description = coalesce(@description, description),
      updated_at = @updated_at
     where id = @id`
  ).run({
    id,
    title: body.title ?? null,
    project: body.project ?? null,
    status: body.status ?? null,
    date: body.date ?? null,
    priority: body.priority !== undefined ? Number(body.priority) : null,
    description: body.description ?? null,
    updated_at: now
  });
  if (!info.changes) {
    return NextResponse.json({ error: "Task not found", changes: info.changes }, { status: 404 });
  }
  const existing = db.prepare("select title from tasks where id = ?").get(id) as { title?: string } | undefined;
  const payload = { ...body, title: body.title ?? existing?.title };
  logEvent({ entity: "task", entityId: id, type: "task.updated", actor: body.actor ?? "Agent", payload });
  return NextResponse.json({ ok: true, changes: info.changes });
}

export async function DELETE(_req: Request, { params }: Params) {
  const db = getDb();
  const { id } = await Promise.resolve(params);
  db.prepare(`delete from tasks where id = ?`).run(id);
  logEvent({ entity: "task", entityId: id, type: "task.deleted", actor: "Agent" });
  return NextResponse.json({ ok: true });
}
