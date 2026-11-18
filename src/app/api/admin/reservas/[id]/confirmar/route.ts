import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Não autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { id } = await context.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { ok: false, message: "ID de reserva inválido." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_confirmar_pagamento", {
      p_reserva_id: id,
      p_admin_id: admin.admin_id,
    });

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "Erro ao confirmar pagamento." },
        { status: 500 }
      );
    }

    const result = data as { ok: boolean; status_http?: number };
    const status =
      typeof result.status_http === "number"
        ? result.status_http
        : result.ok
          ? 200
          : 409;

    return NextResponse.json(result, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao confirmar pagamento." },
      { status: 500 }
    );
  }
}
