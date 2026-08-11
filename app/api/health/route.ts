import { NextResponse } from "next/server";
import { getDb } from "@/db";

export async function GET() {
  try {
    getDb();
    return NextResponse.json({ ok: true, db: "connected" });
  } catch {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
