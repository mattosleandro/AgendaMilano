import type { AgendaConfig } from "./types";

export const DEFAULT_AGENDA_CONFIG: AgendaConfig = {
  timezone: "America/Campo_Grande",
  dia_abertura_lote: 25,
  hora_abertura_lote: "20:00:00",
  prazo_pagamento_horas: 48,
};

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ymd: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function getZonedDateParts(
  utcMs: number,
  timeZone: string = DEFAULT_AGENDA_CONFIG.timezone
): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  const second = Number(map.second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    ymd: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/**
 * Converte uma data/hora civil em `timeZone` para timestamp UTC (ms) de forma exata.
 */
export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = DEFAULT_AGENDA_CONFIG.timezone
): number {
  const targetUtcWall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetUtcWall;

  for (let i = 0; i < 2; i++) {
    const p = getZonedDateParts(guess, timeZone);
    const actualWall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = targetUtcWall - actualWall;
    if (delta === 0) break;
    guess += delta;
  }

  return guess;
}

export function parseTimeParts(horaStr: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(horaStr.trim());
  if (!match) {
    return { hour: 20, minute: 0, second: 0 };
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? "0"),
  };
}

/**
 * Regra canônica: para qualquer data em (targetYear, targetMonth),
 * o lote abre no dia 25 às 20:00:00 do mês imediatamente anterior no fuso oficial.
 */
export function getBatchOpeningUtcMs(
  targetYear: number,
  targetMonth: number,
  config: AgendaConfig = DEFAULT_AGENDA_CONFIG
): number {
  const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
  const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
  const { hour, minute, second } = parseTimeParts(config.hora_abertura_lote);

  return zonedWallTimeToUtcMs(
    prevYear,
    prevMonth,
    config.dia_abertura_lote,
    hour,
    minute,
    second,
    config.timezone
  );
}

export function isMonthUnlocked(
  targetYear: number,
  targetMonth: number,
  nowMs: number,
  config: AgendaConfig = DEFAULT_AGENDA_CONFIG
): { unlocked: boolean; openingUtcMs: number; remainingMs: number } {
  const openingUtcMs = getBatchOpeningUtcMs(targetYear, targetMonth, config);
  const remainingMs = Math.max(0, openingUtcMs - nowMs);
  return {
    unlocked: nowMs >= openingUtcMs,
    openingUtcMs,
    remainingMs,
  };
}

export function isDateBookable(
  dateYmd: string,
  nowMs: number,
  config: AgendaConfig = DEFAULT_AGENDA_CONFIG
): {
  bookable: boolean;
  reason: "OK" | "PAST_DATE" | "LOCKED_BATCH";
  openingUtcMs: number;
} {
  const [yStr, mStr] = dateYmd.split("-");
  const targetYear = Number(yStr);
  const targetMonth = Number(mStr);
  const todayLocal = getZonedDateParts(nowMs, config.timezone).ymd;
  const openingUtcMs = getBatchOpeningUtcMs(targetYear, targetMonth, config);

  if (dateYmd < todayLocal) {
    return { bookable: false, reason: "PAST_DATE", openingUtcMs };
  }

  if (nowMs < openingUtcMs) {
    return { bookable: false, reason: "LOCKED_BATCH", openingUtcMs };
  }

  return { bookable: true, reason: "OK", openingUtcMs };
}

export function formatCountdownParts(remainingMs: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
