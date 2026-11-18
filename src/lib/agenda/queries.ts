import { cookies } from "next/headers";
import { getServerEnv } from "../env";
import {
  ADMIN_COOKIE_NAME,
  MORADOR_COOKIE_NAME,
  verifySignedPayload,
} from "../security/session";
import { getSupabaseAdmin } from "../supabase-server";
import { getActiveHolidaysForYear } from "./holidays";
import {
  DEFAULT_AGENDA_CONFIG,
  getZonedDateParts,
  isMonthUnlocked,
} from "./opening-window";
import type {
  AdminCookieSession,
  AdminReservaItem,
  AgendaConfig,
  AgendaMesResponse,
  Espaco,
  FeriadoPublico,
  MinhaReserva,
  MoradorCookieSession,
  ReservaPublica,
} from "./types";

export async function getMoradorSessionFromCookies(): Promise<MoradorCookieSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(MORADOR_COOKIE_NAME)?.value;
  if (!token) return null;
  const { sessionSecret } = getServerEnv();
  return verifySignedPayload<MoradorCookieSession>(token, sessionSecret);
}

export async function getAdminSessionFromCookies(): Promise<AdminCookieSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return null;
  const { sessionSecret } = getServerEnv();
  return verifySignedPayload<AdminCookieSession>(token, sessionSecret);
}

export async function getAgendaConfig(): Promise<AgendaConfig> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_config")
    .select("timezone, dia_abertura_lote, hora_abertura_lote, prazo_pagamento_horas")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_AGENDA_CONFIG;
  }

  return {
    timezone: data.timezone || DEFAULT_AGENDA_CONFIG.timezone,
    dia_abertura_lote: Number(data.dia_abertura_lote) || 25,
    hora_abertura_lote: data.hora_abertura_lote || "20:00:00",
    prazo_pagamento_horas: Number(data.prazo_pagamento_horas) || 48,
  };
}

export async function getEspacosAtivos(): Promise<Espaco[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_espacos")
    .select(
      "id, slug, nome, descricao_localizacao, capacidade_maxima, exige_aceite_capacidade, preco_seg_qui_centavos, preco_sex_centavos, preco_fds_feriado_centavos, ativo, ordem"
    )
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar espaços: ${error.message}`);
  }

  return (data ?? []) as Espaco[];
}

function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Monta o payload público mensal da agenda.
 * Consulta exclusivamente `agenda_reservas_publicas` (projeção sem PII).
 */
export async function getAgendaMesData(
  requestedYear?: number,
  requestedMonth?: number
): Promise<AgendaMesResponse> {
  const nowMs = Date.now();
  const config = await getAgendaConfig();
  const todayParts = getZonedDateParts(nowMs, config.timezone);

  const year =
    requestedYear && requestedYear >= 2025 && requestedYear <= 2100
      ? requestedYear
      : todayParts.year;
  const month =
    requestedMonth && requestedMonth >= 1 && requestedMonth <= 12
      ? requestedMonth
      : todayParts.month;

  const { start, end } = getMonthDateRange(year, month);
  const supabase = getSupabaseAdmin();

  const [espacos, feriados, reservasRes] = await Promise.all([
    getEspacosAtivos(),
    getActiveHolidaysForYear(year),
    supabase
      .from("agenda_reservas_publicas")
      .select(
        "id, espaco_id, data_reserva, bloco, apartamento, identificacao_publica, status_efetivo, expires_at"
      )
      .gte("data_reserva", start)
      .lte("data_reserva", end)
      .order("data_reserva", { ascending: true }),
  ]);

  if (reservasRes.error) {
    throw new Error(`Erro ao consultar agenda pública: ${reservasRes.error.message}`);
  }

  const opening = isMonthUnlocked(year, month, nowMs, config);

  return {
    year,
    month,
    serverNow: new Date(nowMs).toISOString(),
    todayLocal: todayParts.ymd,
    config,
    monthUnlocked: opening.unlocked,
    openingAt: new Date(opening.openingUtcMs).toISOString(),
    espacos,
    feriados,
    reservas: (reservasRes.data ?? []) as ReservaPublica[],
  };
}

/**
 * Lista reservas do morador identificado (identificado pelo hash no cookie HttpOnly).
 */
export async function getMinhasReservas(
  titularCpfHash: string
): Promise<MinhaReserva[]> {
  const supabase = getSupabaseAdmin();
  const nowMs = Date.now();

  const { data, error } = await supabase
    .from("agenda_reservas")
    .select(
      `
      id,
      espaco_id,
      data_reserva,
      identificacao_publica,
      status,
      valor_centavos,
      regra_tarifa,
      aceite_capacidade,
      created_at,
      expires_at,
      confirmado_em,
      cancelado_em,
      motivo_cancelamento,
      agenda_espacos ( slug, nome, descricao_localizacao ),
      agenda_recibos ( codigo_recibo )
    `
    )
    .eq("titular_cpf_hash", titularCpfHash)
    .order("data_reserva", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Erro ao carregar suas reservas: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const esp = row.agenda_espacos as
      | { slug?: string; nome?: string; descricao_localizacao?: string }
      | null;
    const recRaw = row.agenda_recibos as
      | { codigo_recibo?: string }
      | Array<{ codigo_recibo?: string }>
      | null;
    const codigoRecibo = Array.isArray(recRaw)
      ? recRaw[0]?.codigo_recibo ?? null
      : recRaw?.codigo_recibo ?? null;

    const rawStatus = String(row.status) as MinhaReserva["status"];
    const expiresAt = String(row.expires_at);
    const effectiveStatus =
      rawStatus === "PENDENTE_PAGAMENTO" && new Date(expiresAt).getTime() <= nowMs
        ? "EXPIRADO"
        : rawStatus;

    return {
      id: String(row.id),
      espaco_id: String(row.espaco_id),
      espaco_nome: esp?.nome ?? "Espaço",
      espaco_slug: esp?.slug ?? "",
      espaco_descricao: esp?.descricao_localizacao ?? "",
      data_reserva: String(row.data_reserva),
      identificacao_publica: String(row.identificacao_publica),
      status: effectiveStatus,
      valor_centavos: Number(row.valor_centavos),
      regra_tarifa: String(row.regra_tarifa),
      aceite_capacidade: Boolean(row.aceite_capacidade),
      created_at: String(row.created_at),
      expires_at: expiresAt,
      confirmado_em: row.confirmado_em ? String(row.confirmado_em) : null,
      cancelado_em: row.cancelado_em ? String(row.cancelado_em) : null,
      motivo_cancelamento: row.motivo_cancelamento
        ? String(row.motivo_cancelamento)
        : null,
      codigo_recibo: codigoRecibo,
    };
  });
}

/**
 * Consulta reservas completas para o Painel do Síndico (sem expor CPF/Nome/PII).
 */
export async function getAdminReservas(filters?: {
  status?: string;
  espacoId?: string;
  yearMonth?: string;
  search?: string;
}): Promise<AdminReservaItem[]> {
  const supabase = getSupabaseAdmin();
  const nowMs = Date.now();

  let query = supabase
    .from("agenda_reservas")
    .select(
      `
      id,
      espaco_id,
      data_reserva,
      bloco,
      apartamento,
      identificacao_publica,
      status,
      valor_centavos,
      regra_tarifa,
      aceite_capacidade,
      created_at,
      expires_at,
      confirmado_em,
      cancelado_em,
      motivo_cancelamento,
      agenda_espacos ( slug, nome, descricao_localizacao ),
      agenda_recibos ( codigo_recibo )
    `
    )
    .order("data_reserva", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.espacoId && filters.espacoId !== "ALL") {
    query = query.eq("espaco_id", filters.espacoId);
  }

  if (filters?.yearMonth && /^\d{4}-\d{2}$/.test(filters.yearMonth)) {
    const [y, m] = filters.yearMonth.split("-").map(Number);
    const { start, end } = getMonthDateRange(y, m);
    query = query.gte("data_reserva", start).lte("data_reserva", end);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar reservas administrativas: ${error.message}`);
  }

  let list: AdminReservaItem[] = (data ?? []).map((row: Record<string, unknown>) => {
    const esp = row.agenda_espacos as
      | { slug?: string; nome?: string; descricao_localizacao?: string }
      | null;
    const recRaw = row.agenda_recibos as
      | { codigo_recibo?: string }
      | Array<{ codigo_recibo?: string }>
      | null;
    const codigoRecibo = Array.isArray(recRaw)
      ? recRaw[0]?.codigo_recibo ?? null
      : recRaw?.codigo_recibo ?? null;

    const rawStatus = String(row.status) as AdminReservaItem["status"];
    const expiresAt = String(row.expires_at);
    const effectiveStatus =
      rawStatus === "PENDENTE_PAGAMENTO" && new Date(expiresAt).getTime() <= nowMs
        ? "EXPIRADO"
        : rawStatus;

    return {
      id: String(row.id),
      espaco_id: String(row.espaco_id),
      espaco_nome: esp?.nome ?? "Espaço",
      espaco_slug: esp?.slug ?? "",
      espaco_descricao: esp?.descricao_localizacao ?? "",
      data_reserva: String(row.data_reserva),
      bloco: Number(row.bloco),
      apartamento: Number(row.apartamento),
      identificacao_publica: String(row.identificacao_publica),
      status: rawStatus,
      status_efetivo: effectiveStatus,
      valor_centavos: Number(row.valor_centavos),
      regra_tarifa: String(row.regra_tarifa),
      aceite_capacidade: Boolean(row.aceite_capacidade),
      created_at: String(row.created_at),
      expires_at: expiresAt,
      confirmado_em: row.confirmado_em ? String(row.confirmado_em) : null,
      cancelado_em: row.cancelado_em ? String(row.cancelado_em) : null,
      motivo_cancelamento: row.motivo_cancelamento
        ? String(row.motivo_cancelamento)
        : null,
      codigo_recibo: codigoRecibo,
    };
  });

  if (filters?.status && filters.status !== "ALL") {
    list = list.filter((item) => item.status_efetivo === filters.status);
  }

  if (filters?.search && filters.search.trim().length > 0) {
    const needle = filters.search.trim().toLowerCase();
    list = list.filter(
      (item) =>
        item.identificacao_publica.toLowerCase().includes(needle) ||
        `${item.bloco}/${item.apartamento}`.includes(needle) ||
        (item.codigo_recibo ?? "").toLowerCase().includes(needle)
    );
  }

  // Pendentes ordenados pela expiração mais urgente primeiro
  if (filters?.status === "PENDENTE_PAGAMENTO") {
    list.sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
    );
  }

  return list;
}

export async function getAdminFeriadosInitialData(): Promise<{
  year: number;
  feriados: FeriadoPublico[];
}> {
  const currentYear = getZonedDateParts(Date.now()).year;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_feriados")
    .select("id, data, nome, tipo, origem, ativo")
    .gte("data", `${currentYear}-01-01`)
    .lte("data", `${currentYear}-12-31`)
    .order("data", { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar feriados: ${error.message}`);
  }

  return {
    year: currentYear,
    feriados: (data ?? []) as FeriadoPublico[],
  };
}
