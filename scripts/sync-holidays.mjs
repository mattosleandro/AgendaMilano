#!/usr/bin/env node
/**
 * Sincroniza feriados nacionais da BrasilAPI para public.agenda_feriados,
 * preservando integralmente feriados locais com origem = 'MANUAL'.
 * Uso: node scripts/sync-holidays.mjs [ano1] [ano2] ...
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_INTERNAL_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Defina SUPABASE_INTERNAL_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const currentYear = new Date().getUTCFullYear();
const argsYears = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n >= 2024 && n <= 2100);
const years = argsYears.length > 0 ? argsYears : [currentYear, currentYear + 1];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const year of years) {
  const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "AgendaMilano/1.0 (+https://agenda.portalmilano.com)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`BrasilAPI HTTP ${res.status} para ${year}`);
  }
  const list = await res.json();
  const { data: existing, error: selErr } = await supabase
    .from("agenda_feriados")
    .select("data, origem")
    .gte("data", `${year}-01-01`)
    .lte("data", `${year}-12-31`);
  if (selErr) throw new Error(selErr.message);

  const manualSet = new Set(
    (existing ?? []).filter((r) => r.origem === "MANUAL").map((r) => String(r.data))
  );

  const rows = list
    .filter((it) => it && typeof it.date === "string" && !manualSet.has(it.date))
    .map((it) => ({
      data: it.date,
      nome: String(it.name).trim(),
      tipo: "NACIONAL",
      origem: "BRASILAPI",
      ativo: true,
    }));

  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .from("agenda_feriados")
      .upsert(rows, { onConflict: "data" });
    if (upErr) throw new Error(upErr.message);
  }

  console.log(
    `[sync-holidays] ${year}: obtidos=${list.length}, gravados=${rows.length}, manuais_preservados=${list.length - rows.length}`
  );
}
