import { NextResponse } from "next/server";
import { getMoradorSessionFromCookies } from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleResidentCancel(id: string) {
  const session = await getMoradorSessionFromCookies();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "NAO_AUTENTICADO",
        message: "Identifique-se com seu CPF para cancelar sua reserva.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { ok: false, code: "ID_INVALIDO", message: "Identificador de reserva inválido." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc(
      "agenda_cancelar_reserva_morador",
      {
        p_reserva_id: id,
        p_titular_cpf_hash: session.titular_cpf_hash,
      }
    );

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          code: "ERRO_CANCELAMENTO",
          message: "Não foi possível cancelar a reserva. Tente novamente.",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
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
      {
        ok: false,
        code: "ERRO_INTERNO",
        message: "Erro inesperado ao cancelar a reserva.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleResidentCancel(id);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return handleResidentCancel(id);
}
