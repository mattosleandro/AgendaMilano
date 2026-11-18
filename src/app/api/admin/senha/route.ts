import { NextResponse } from "next/server";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Não autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: { senhaAtual?: unknown; novaSenha?: unknown };
  try {
    body = (await request.json()) as {
      senhaAtual?: unknown;
      novaSenha?: unknown;
    };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const senhaAtual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
  const novaSenha = typeof body.novaSenha === "string" ? body.novaSenha : "";

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_alterar_senha_admin", {
      p_admin_id: admin.admin_id,
      p_senha_atual: senhaAtual,
      p_nova_senha: novaSenha,
    });

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "Erro ao alterar senha." },
        { status: 500 }
      );
    }

    const result = data as { ok: boolean; message?: string };
    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao alterar senha." },
      { status: 500 }
    );
  }
}
