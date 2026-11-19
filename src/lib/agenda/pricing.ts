import type { Espaco, FeriadoPublico, RegraTarifa } from "./types";

/**
 * Retorna dia da semana ISO (1 = Segunda .. 7 = Domingo) independente do fuso local.
 */
export function getIsoDayOfWeek(dateYmd: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom .. 6=Sáb
  return (jsDay === 0 ? 7 : jsDay) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface PriceCalculation {
  valorCentavos: number;
  regraTarifa: RegraTarifa;
  ehFeriado: boolean;
  feriadoNome: string | null;
  isodow: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/**
 * Motor determinístico de precificação.
 * Regra canônica: véspera de feriado NÃO altera a tarifa.
 */
export function calculateSpacePrice(
  espaco: Pick<
    Espaco,
    "preco_seg_qui_centavos" | "preco_sex_centavos" | "preco_fds_feriado_centavos"
  >,
  dateYmd: string,
  holidayMap: ReadonlyMap<string, Pick<FeriadoPublico, "nome" | "tipo" | "ativo">>
): PriceCalculation {
  const isodow = getIsoDayOfWeek(dateYmd);
  const holiday = holidayMap.get(dateYmd);
  const ehFeriado = Boolean(holiday && holiday.ativo !== false);

  if (ehFeriado || isodow === 6 || isodow === 7) {
    return {
      valorCentavos: espaco.preco_fds_feriado_centavos,
      regraTarifa: ehFeriado ? "FERIADO" : isodow === 6 ? "SABADO" : "DOMINGO",
      ehFeriado,
      feriadoNome: ehFeriado ? holiday?.nome ?? null : null,
      isodow,
    };
  }

  if (isodow === 5) {
    return {
      valorCentavos: espaco.preco_sex_centavos,
      regraTarifa: "SEXTA",
      ehFeriado: false,
      feriadoNome: null,
      isodow,
    };
  }

  return {
    valorCentavos: espaco.preco_seg_qui_centavos,
    regraTarifa: "SEG_A_QUI",
    ehFeriado: false,
    feriadoNome: null,
    isodow,
  };
}

export function formatBrlFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatBrlShort(cents: number): string {
  const reais = cents / 100;
  if (Number.isInteger(reais)) {
    return `R$ ${reais}`;
  }
  return formatBrlFromCents(cents);
}

const WEEKDAYS_PT = [
  "",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

const MONTHS_PT = [
  "",
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function formatDateShortPtBr(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateLongPtBr(dateYmd: string): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const isodow = getIsoDayOfWeek(dateYmd);
  return `${WEEKDAYS_PT[isodow]}, ${String(d).padStart(2, "0")} de ${MONTHS_PT[m]} de ${y}`;
}

export function formatMonthYearPtBr(year: number, month: number): string {
  const name = MONTHS_PT[month] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

export function formatDateTimeShortPtBr(isoStr: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Campo_Grande",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoStr));

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return `${map.day}/${map.month}/${map.year} às ${map.hour}:${map.minute}`;
}

export function formatDateTimeCampoGrande(isoStr: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Campo_Grande",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoStr));

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  return `${map.day}/${map.month}/${map.year} às ${map.hour}:${map.minute}:${map.second}`;
}

export function getRegraTarifaLabel(regra: string): string {
  switch (regra) {
    case "SEG_A_QUI":
      return "Tarifa Segunda a Quinta";
    case "SEXTA":
      return "Tarifa Sexta-feira";
    case "SABADO":
      return "Tarifa Sábado";
    case "DOMINGO":
      return "Tarifa Domingo";
    case "FERIADO":
      return "Tarifa Feriado";
    default:
      return regra;
  }
}
