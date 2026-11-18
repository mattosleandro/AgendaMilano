import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";
import type { FeriadoTipo } from "@/lib/agenda/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ALLOWED_TIPOS: FeriadoTipo[] = [
  "ESTADUAL",
  "MUNICIPAL",
  "CONDOMINIO",
  "NACIONAL",
];

export async function GET(request: Request) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = Number(searchParams.get("year") ?? new Date().getUTCFullYear());
  const year = Number.isInteger(yearParam) ? yearParam : new Date().getUTCFullYear();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_feriados")
    .select("id, data, nome, tipo, origem, ativo")
    .gte("data", `${year}-01-01`)
    .lte("data", `${year}-12-31`)
    .order("data", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, message: "Erro ao listar feriados." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, year, feriados: data ?? [] },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  let body: { data?: unknown; nome?: unknown; tipo?: unknown };
  try {
    body = (await request.json()) as {
      data?: unknown;
      nome?: unknown;
      tipo?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const dataStr = typeof body.data === "string" ? body.data.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const tipo = typeof body.tipo === "string" ? (body.tipo as FeriadoTipo) : "MUNICIPAL";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return NextResponse.json(
      { ok: false, message: "Data inválida. Use o formato AAAA-MM-DD." },
      { status: 400 }
    );
  }
  if (nome.length < 2) {
    return NextResponse.json(
      { ok: false, message: "Informe o nome do feriado." },
      { status: 400 }
    );
  }
  if (!ALLOWED_TIPOS.includes(tipo)) {
    return NextResponse.json(
      { ok: false, message: "Tipo de feriado inválido." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: inserted, error } = await supabase
    .from("agenda_feriados")
    .upsert(
      {
        data: dataStr,
        nome,
        tipo,
        origem: "MANUAL",
        ativo: true,
      },
      { onConflict: "data" }
    )
    .select("id, data, nome, tipo, origem, ativo")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, message: `Erro ao salvar feriado: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { ok: true, feriado: inserted },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
