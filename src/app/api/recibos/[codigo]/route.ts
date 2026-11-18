import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ codigo: string }> }
) {
  const { codigo } = await context.params;
  const cleanCode = (codigo || "").trim().toUpperCase();

  if (!/^MIL-\d{4}-[A-Z0-9]{6,}$/.test(cleanCode)) {
    return NextResponse.json(
      { ok: false, code: "CODIGO_INVALIDO", message: "Código de recibo inválido." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_verificar_recibo", {
      p_codigo: cleanCode,
    });

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "Não foi possível consultar o recibo." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = data as { ok: boolean };
    return NextResponse.json(result, {
      status: result.ok ? 200 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro ao verificar recibo." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
