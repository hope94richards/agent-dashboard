import { getDb, logEvent, nowIso } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  const rows = db.prepare("select * from tasks order by updated_at desc").all();
  return NextResponse.json(rows);
}

const REQUIRED_FIELDS = ["title", "project", "status", "priority", "description"] as const;
const ALLOWED_STATUS = new Set(["todo", "blocked", "in_progress", "done", "archived"]);

function validateTaskBody(body: any) {
  const missing = REQUIRED_FIELDS.filter((field) => body?.[field] === undefined || body?.[field] === null || body?.[field] === "");
  if (missing.length) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  if (!ALLOWED_STATUS.has(body.status)) {
    return `Invalid status: ${body.status}`;
  }
  if (Number.isNaN(Number(body.priority))) {
    return "Priority must be a number";
  }
  return null;
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const validationError = validateTaskBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = nowIso();
  db.prepare(
    `insert into tasks (id, title, project, status, date, priority, description, created_at, updated_at)
     values (@id, @title, @project, @status, @date, @priority, @description, @created_at, @updated_at)`
  ).run({
    id,
    title: body.title,
    project: body.project,
    status: body.status,
    date: body.date ?? null,
    priority: Number(body.priority),
    description: body.description,
    created_at: now,
    updated_at: now
  });
  logEvent({ entity: "task", entityId: id, type: "task.created", actor: body.actor ?? "Agent", payload: body });
  return NextResponse.json({ id });
}
