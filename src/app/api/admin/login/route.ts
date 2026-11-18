import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit, extractClientIp } from "@/lib/security/rate-limit";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_TTL_SECONDS,
  createAdminSessionToken,
  getSessionCookieOptions,
} from "@/lib/security/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";

interface RpcAdminLoginResult {
  ok: boolean;
  code?: string;
  message?: string;
  admin_id?: string;
  username?: string;
  nome_exibicao?: string;
}

export async function POST(request: Request) {
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`admin-login:${ip}`, 10, 5 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT",
        message: `Muitas tentativas de acesso. Aguarde ${limit.retryAfterSeconds} segundos.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const username =
    typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, message: "Informe usuário e senha." },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_autenticar_admin", {
      p_username: username,
      p_password: password,
    });

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: "Erro ao autenticar administrador." },
        { status: 500 }
      );
    }

    const result = data as RpcAdminLoginResult;
    if (!result.ok || !result.admin_id || !result.username || !result.nome_exibicao) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code || "CREDENCIAIS_INVALIDAS",
          message: result.message || "Usuário ou senha inválidos.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const env = getServerEnv();
    const token = createAdminSessionToken(
      {
        admin_id: result.admin_id,
        username: result.username,
        nome_exibicao: result.nome_exibicao,
      },
      env.sessionSecret
    );

    const response = NextResponse.json(
      {
        ok: true,
        admin: {
          username: result.username,
          nome_exibicao: result.nome_exibicao,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

    response.cookies.set(
      ADMIN_COOKIE_NAME,
      token,
      getSessionCookieOptions(env.isProd, ADMIN_TTL_SECONDS)
    );

    return response;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao autenticar." },
      { status: 500 }
    );
  }
}
