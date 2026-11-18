import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ ok: false, message: "ID inválido." }, { status: 400 });
  }

  let body: { ativo?: unknown; nome?: unknown };
  try {
    body = (await request.json()) as { ativo?: unknown; nome?: unknown };
  } catch {
    return NextResponse.json({ ok: false, message: "Requisição inválida." }, { status: 400 });
  }

  const updateFields: { ativo?: boolean; nome?: string } = {};
  if (typeof body.ativo === "boolean") updateFields.ativo = body.ativo;
  if (typeof body.nome === "string" && body.nome.trim().length >= 2) {
    updateFields.nome = body.nome.trim();
  }

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json(
      { ok: false, message: "Nenhum campo válido enviado para atualização." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_feriados")
    .update(updateFields)
    .eq("id", id)
    .select("id, data, nome, tipo, origem, ativo")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, message: "Feriado não encontrado ou erro ao atualizar." },
      { status: error ? 500 : 404 }
    );
  }

  return NextResponse.json(
    { ok: true, feriado: data },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ ok: false, message: "ID inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("agenda_feriados")
    .select("id, origem")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { ok: false, message: "Feriado não encontrado." },
      { status: 404 }
    );
  }

  if (existing.origem !== "MANUAL") {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Feriados nacionais da BrasilAPI não devem ser excluídos — use desativar caso deseje ignorar.",
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("agenda_feriados").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { ok: false, message: "Erro ao remover feriado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
