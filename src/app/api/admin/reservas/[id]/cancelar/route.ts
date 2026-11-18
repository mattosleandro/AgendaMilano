import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
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

  let body: { motivo?: unknown };
  try {
    body = (await request.json()) as { motivo?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  if (motivo.length < 3) {
    return NextResponse.json(
      {
        ok: false,
        message: "Informe o motivo do cancelamento (mínimo 3 caracteres).",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_cancelar_reserva", {
      p_reserva_id: id,
      p_admin_id: admin.admin_id,
      p_motivo: motivo,
    });

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "Erro ao cancelar reserva." },
        { status: 500 }
      );
    }

    const result = data as { ok: boolean; status_http?: number };
    const status =
      typeof result.status_http === "number"
        ? result.status_http
        : result.ok
          ? 200
          : 400;

    return NextResponse.json(result, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao cancelar reserva." },
      { status: 500 }
    );
  }
}
