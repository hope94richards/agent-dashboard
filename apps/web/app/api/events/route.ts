import { getDb } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Number(searchParams.get("limit") || 100);

  let query = "select * from events";
  const params: any[] = [];
  const clauses: string[] = [];
  if (from) {
    clauses.push("ts_epoch >= ?");
    params.push(Number(from));
  }
  if (to) {
    clauses.push("ts_epoch <= ?");
    params.push(Number(to));
  }
  if (clauses.length) query += " where " + clauses.join(" and ");
  query += " order by ts_epoch desc limit ?";
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  return NextResponse.json(rows);
}
