import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("agenda_config")
      .select("id")
      .eq("id", 1)
      .single();

    if (error) {
      return NextResponse.json(
        { status: "degraded", db: "error" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        service: "agenda-milano",
        db: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
