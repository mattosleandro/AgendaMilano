import { NextResponse } from "next/server";
import {
  getMinhasReservas,
  getMoradorSessionFromCookies,
} from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const session = await getMoradorSessionFromCookies();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "NAO_AUTENTICADO",
        message: "Identifique-se com seu CPF para ver suas reservas.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const reservas = await getMinhasReservas(session.titular_cpf_hash);
    return NextResponse.json(
      { ok: true, reservas },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro ao consultar suas reservas." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  const session = await getMoradorSessionFromCookies();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        code: "NAO_AUTENTICADO",
        message: "Identifique-se com seu CPF antes de confirmar a reserva.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: {
    espacoId?: unknown;
    dataReserva?: unknown;
    aceiteCapacidade?: unknown;
  };
  try {
    body = (await request.json()) as {
      espacoId?: unknown;
      dataReserva?: unknown;
      aceiteCapacidade?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, code: "JSON_INVALIDO", message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const espacoId = typeof body.espacoId === "string" ? body.espacoId.trim() : "";
  const dataReserva =
    typeof body.dataReserva === "string" ? body.dataReserva.trim() : "";
  const aceiteCapacidade = body.aceiteCapacidade === true;

  if (!UUID_REGEX.test(espacoId) || !DATE_REGEX.test(dataReserva)) {
    return NextResponse.json(
      {
        ok: false,
        code: "PARAMETROS_INVALIDOS",
        message: "Espaço ou data informados em formato inválido.",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_criar_reserva", {
      p_espaco_id: espacoId,
      p_unidade_id: session.unidade_principal_id,
      p_identificacao_publica: session.identificacao_publica,
      p_titular_cpf_hash: session.titular_cpf_hash,
      p_data: dataReserva,
      p_aceite_capacidade: aceiteCapacidade,
    });

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          code: "ERRO_RESERVA",
          message: "Não foi possível registrar a reserva. Tente novamente.",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = data as { ok: boolean; status_http?: number };
    const status =
      typeof result.status_http === "number"
        ? result.status_http
        : result.ok
          ? 201
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
        message: "Erro inesperado ao registrar a reserva.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
