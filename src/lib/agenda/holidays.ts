import { getSupabaseAdmin } from "../supabase-server";
import type { FeriadoPublico } from "./types";

interface BrasilApiHolidayItem {
  date: string;
  name: string;
  type: string;
}

const SYNC_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const lastSyncByYear = new Map<number, number>();
const inflightByYear = new Map<number, Promise<SyncYearResult>>();

/**
 * Feriados oficiais fixos do Estado de Mato Grosso do Sul (Lei Estadual nº 10/1979)
 * e do Município de Dourados - MS (Lei Municipal nº 662/1967), complementando
 * os feriados nacionais retornados pela BrasilAPI.
 */
function getOfficialDouradosMsHolidays(year: number) {
  return [
    {
      data: `${year}-10-11`,
      nome: "Criação do Estado de Mato Grosso do Sul",
      tipo: "ESTADUAL" as const,
      origem: "MANUAL" as const,
      ativo: true,
    },
    {
      data: `${year}-12-08`,
      nome: "Nossa Senhora da Imaculada Conceição (Padroeira de Dourados)",
      tipo: "MUNICIPAL" as const,
      origem: "MANUAL" as const,
      ativo: true,
    },
    {
      data: `${year}-12-20`,
      nome: "Aniversário de Dourados",
      tipo: "MUNICIPAL" as const,
      origem: "MANUAL" as const,
      ativo: true,
    },
  ];
}

export interface SyncYearResult {
  year: number;
  ok: boolean;
  fetched: number;
  upserted: number;
  skippedManual: number;
  error?: string;
}

function isValidBrasilApiItem(item: unknown): item is BrasilApiHolidayItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Record<string, unknown>;
  return (
    typeof candidate.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0
  );
}

export async function fetchBrasilApiHolidays(
  year: number
): Promise<BrasilApiHolidayItem[]> {
  const res = await fetch(
    `https://brasilapi.com.br/api/feriados/v1/${year}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AgendaMilano/1.0 (+https://agenda.portalmilano.com)",
      },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error(`BrasilAPI retornou HTTP ${res.status} para o ano ${year}`);
  }

  const raw = (await res.json()) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("Resposta inválida da BrasilAPI.");
  }

  return raw.filter(isValidBrasilApiItem);
}

export async function syncYearFromBrasilApi(
  year: number
): Promise<SyncYearResult> {
  const existingPromise = inflightByYear.get(year);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<SyncYearResult> => {
    try {
      const items = await fetchBrasilApiHolidays(year);
      if (items.length === 0) {
        return {
          year,
          ok: true,
          fetched: 0,
          upserted: 0,
          skippedManual: 0,
        };
      }

      const supabase = getSupabaseAdmin();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      // Preserva qualquer feriado local/manual cadastrado na mesma data
      const { data: existingRows, error: selectErr } = await supabase
        .from("agenda_feriados")
        .select("data, origem")
        .gte("data", startDate)
        .lte("data", endDate);

      if (selectErr) {
        throw new Error(selectErr.message);
      }

      const manualDates = new Set(
        (existingRows ?? [])
          .filter((r) => r.origem === "MANUAL")
          .map((r) => String(r.data))
      );

      const toUpsert = items
        .filter((it) => !manualDates.has(it.date))
        .map((it) => ({
          data: it.date,
          nome: it.name.trim(),
          tipo: "NACIONAL" as const,
          origem: "BRASILAPI" as const,
          ativo: true,
        }));

      // Complementa automaticamente feriados oficiais de Dourados - MS e Mato Grosso do Sul
      // quando ainda não cadastrados manualmente para aquele ano
      const localDouradosMs = getOfficialDouradosMsHolidays(year).filter(
        (loc) => !manualDates.has(loc.data)
      );

      const combinedUpsert = [...toUpsert, ...localDouradosMs];

      if (combinedUpsert.length > 0) {
        const { error: upsertErr } = await supabase
          .from("agenda_feriados")
          .upsert(combinedUpsert, { onConflict: "data" });

        if (upsertErr) {
          throw new Error(upsertErr.message);
        }
      }

      lastSyncByYear.set(year, Date.now());
      return {
        year,
        ok: true,
        fetched: items.length,
        upserted: combinedUpsert.length,
        skippedManual: manualDates.size,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar BrasilAPI";
      console.warn(`[holidays] Falha na sincronização BrasilAPI (${year}): ${msg}`);
      return {
        year,
        ok: false,
        fetched: 0,
        upserted: 0,
        skippedManual: 0,
        error: msg,
      };
    } finally {
      inflightByYear.delete(year);
    }
  })();

  inflightByYear.set(year, task);
  return task;
}

export async function ensureYearsHolidaysSynced(years: number[]): Promise<void> {
  const now = Date.now();
  const uniqueYears = [...new Set(years)].filter(
    (y) => Number.isInteger(y) && y >= 2024 && y <= 2100
  );

  const staleYears = uniqueYears.filter((y) => {
    const last = lastSyncByYear.get(y);
    return !last || now - last > SYNC_TTL_MS;
  });

  if (staleYears.length === 0) return;

  // Verifica primeiro se já existe cache recente no banco antes de chamar BrasilAPI
  const supabase = getSupabaseAdmin();
  const yearsNeedingFetch: number[] = [];

  for (const year of staleYears) {
    const { count } = await supabase
      .from("agenda_feriados")
      .select("id", { count: "exact", head: true })
      .eq("origem", "BRASILAPI")
      .gte("data", `${year}-01-01`)
      .lte("data", `${year}-12-31`);

    if ((count ?? 0) > 0) {
      lastSyncByYear.set(year, now);
    } else {
      yearsNeedingFetch.push(year);
    }
  }

  if (yearsNeedingFetch.length > 0) {
    await Promise.all(yearsNeedingFetch.map((y) => syncYearFromBrasilApi(y)));
  }
}

export async function getActiveHolidaysForYear(
  year: number
): Promise<FeriadoPublico[]> {
  await ensureYearsHolidaysSynced([year]);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agenda_feriados")
    .select("id, data, nome, tipo, origem, ativo")
    .eq("ativo", true)
    .gte("data", `${year}-01-01`)
    .lte("data", `${year}-12-31`)
    .order("data", { ascending: true });

  if (error) {
    throw new Error(`Erro ao consultar feriados: ${error.message}`);
  }

  return (data ?? []) as FeriadoPublico[];
}
