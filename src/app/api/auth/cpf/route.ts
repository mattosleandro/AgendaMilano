import { NextResponse } from "next/server";
import { isValidCpf, stripNonDigits } from "@/lib/agenda/cpf";
import type { UnidadeResumo } from "@/lib/agenda/types";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit, extractClientIp } from "@/lib/security/rate-limit";
import {
  createMoradorSessionToken,
  getSessionCookieOptions,
  MORADOR_COOKIE_NAME,
  MORADOR_TTL_SECONDS,
  sanitizeMoradorForClient,
} from "@/lib/security/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";

interface RpcCpfResponse {
  ok: boolean;
  code?: string;
  message?: string;
  unidade_principal_id?: string;
  bloco?: number;
  apartamento?: number;
  quantidade_unidades?: number;
  identificacao_publica?: string;
  titular_cpf_hash?: string;
  unidades?: UnidadeResumo[];
}

export async function POST(request: Request) {
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`auth-cpf:${ip}`, 15, 5 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "RATE_LIMIT",
        message: `Muitas tentativas. Aguarde ${limit.retryAfterSeconds} segundos e tente novamente.`,
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

  let body: { cpf?: unknown };
  try {
    body = (await request.json()) as { cpf?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, code: "JSON_INVALIDO", message: "Requisição inválida." },
      { status: 400 }
    );
  }

  const rawCpf = typeof body.cpf === "string" ? body.cpf : "";
  const digits = stripNonDigits(rawCpf);

  if (!isValidCpf(digits)) {
    return NextResponse.json(
      {
        ok: false,
        code: "CPF_INVALIDO",
        message: "CPF inválido. Confira os 11 dígitos informados.",
      },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("agenda_validar_cpf_morador", {
      p_cpf: digits,
    });

    if (error || !data) {
      return NextResponse.json(
        {
          ok: false,
          code: "ERRO_VALIDACAO",
          message: "Não foi possível validar o CPF neste momento. Tente novamente.",
        },
        { status: 500 }
      );
    }

    const result = data as RpcCpfResponse;
    if (
      !result.ok ||
      !result.unidade_principal_id ||
      !result.identificacao_publica ||
      !result.titular_cpf_hash ||
      typeof result.bloco !== "number" ||
      typeof result.apartamento !== "number"
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code || "CPF_NAO_ENCONTRADO",
          message:
            result.message ||
            "CPF não localizado no cadastro oficial de moradores do condomínio.",
        },
        { status: 404 }
      );
    }

    const env = getServerEnv();
    const sessionData = {
      unidade_principal_id: result.unidade_principal_id,
      bloco: result.bloco,
      apartamento: result.apartamento,
      quantidade_unidades: result.quantidade_unidades ?? 1,
      identificacao_publica: result.identificacao_publica,
      titular_cpf_hash: result.titular_cpf_hash,
      unidades: result.unidades ?? [],
    };

    const token = createMoradorSessionToken(sessionData, env.sessionSecret);
    const clientSafe = sanitizeMoradorForClient({ ...sessionData, exp: 0 });

    const response = NextResponse.json(
      { ok: true, morador: clientSafe },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );

    response.cookies.set(
      MORADOR_COOKIE_NAME,
      token,
      getSessionCookieOptions(env.isProd, MORADOR_TTL_SECONDS)
    );

    return response;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "ERRO_INTERNO",
        message: "Erro ao consultar cadastro. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
