"use client";

import {
  CalendarCheck,
  Clock,
  Lock,
  Sparkles,
} from "lucide-react";
import React from "react";
import {
  calculateSpacePrice,
  formatBrlShort,
  formatDateShortPtBr,
} from "@/lib/agenda/pricing";
import type {
  Espaco,
  FeriadoPublico,
  ReservaPublica,
} from "@/lib/agenda/types";

interface CalendarGridProps {
  year: number;
  month: number;
  todayLocal: string;
  monthUnlocked: boolean;
  syncedNowMs: number;
  espaco: Espaco;
  feriados: FeriadoPublico[];
  reservas: ReservaPublica[];
  selectedOccupiedDate: string | null;
  onSelectFreeDate: (dateYmd: string) => void;
  onSelectOccupiedDate: (dateYmd: string) => void;
}

const WEEKDAY_HEADERS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function compactUnitBadge(identificacao: string, bloco: number, apartamento: number): string {
  if (identificacao.includes("/")) {
    return `B${String(bloco).padStart(2, "0")}/${apartamento}+`;
  }
  return `B${String(bloco).padStart(2, "0")}/${apartamento}`;
}

export function CalendarGrid({
  year,
  month,
  todayLocal,
  monthUnlocked,
  syncedNowMs,
  espaco,
  feriados,
  reservas,
  selectedOccupiedDate,
  onSelectFreeDate,
  onSelectOccupiedDate,
}: CalendarGridProps) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Dom .. 6=Sáb

  const holidayMap = new Map<string, FeriadoPublico>();
  for (const f of feriados) {
    if (f.ativo) holidayMap.set(f.data, f);
  }

  // Mapa de reservas ativas para o espaço selecionado (descartando em tempo real pendentes já expirados)
  const reservationByDate = new Map<string, ReservaPublica>();
  for (const r of reservas) {
    if (r.espaco_id !== espaco.id) continue;
    if (
      r.status_efetivo === "PENDENTE_PAGAMENTO" &&
      Date.parse(r.expires_at) <= syncedNowMs
    ) {
      continue;
    }
    reservationByDate.set(r.data_reserva, r);
  }

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border border-[#E7E2D8] bg-white p-3 sm:p-5 shadow-xs">
      {/* Legenda compacta */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#52525B]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#15803D]" />
          Disponível
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
          Aguardando Pagamento (48h)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#166534] ring-2 ring-[#15803D]/25" />
          Confirmado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#9A7D4A]" />
          Feriado
        </span>
      </div>

      {/* Cabeçalho dias da semana */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1.5">
        {WEEKDAY_HEADERS.map((wd) => (
          <div
            key={wd}
            className="py-1 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[#52525B]"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Grade mensal */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[68px] sm:min-h-[88px]" />;
          }

          const dateYmd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = dateYmd < todayLocal;
          const isToday = dateYmd === todayLocal;
          const isLocked = !monthUnlocked;
          const reserva = reservationByDate.get(dateYmd);
          const price = calculateSpacePrice(espaco, dateYmd, holidayMap);

          if (reserva) {
            const isConfirmed = reserva.status_efetivo === "CONFIRMADO";
            const isSelected = selectedOccupiedDate === dateYmd;
            return (
              <button
                key={dateYmd}
                type="button"
                onClick={() => onSelectOccupiedDate(dateYmd)}
                aria-label={`${formatDateShortPtBr(dateYmd)} — ${
                  isConfirmed ? "Confirmado" : "Aguardando Pagamento"
                } — ${reserva.identificacao_publica}`}
                className={`min-h-[68px] sm:min-h-[88px] flex flex-col justify-between rounded-xl border p-1.5 sm:p-2.5 text-left transition-all ${
                  isConfirmed
                    ? "border-[#15803D]/40 bg-[#F0FDF4] text-[#166534]"
                    : "border-[#F59E0B]/50 bg-[#FFFBEB] text-[#92400E]"
                } ${isSelected ? "ring-2 ring-[#0C0C0D]" : "hover:brightness-95"}`}
              >
                <div className="flex w-full items-center justify-between gap-0.5">
                  <span className="font-display text-xs sm:text-sm font-bold tabular-nums">
                    {day}
                  </span>
                  {isConfirmed ? (
                    <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[#15803D]" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-[#D97706]" />
                  )}
                </div>

                <div className="w-full space-y-0.5">
                  <p className="hidden sm:block text-[10px] font-bold uppercase tracking-tight leading-tight">
                    {isConfirmed ? "Confirmado" : "Aguardando"}
                  </p>
                  <p className="sm:hidden text-[10px] font-bold tabular-nums leading-tight truncate">
                    {compactUnitBadge(
                      reserva.identificacao_publica,
                      reserva.bloco,
                      reserva.apartamento
                    )}
                  </p>
                  <p className="hidden sm:block text-[11px] font-semibold tabular-nums leading-tight truncate">
                    {reserva.identificacao_publica}
                  </p>
                </div>
              </button>
            );
          }

          if (isPast || isLocked) {
            return (
              <div
                key={dateYmd}
                aria-disabled="true"
                className="min-h-[68px] sm:min-h-[88px] flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-[#F4F4F5] p-1.5 sm:p-2.5 text-[#71717A] cursor-not-allowed select-none"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-display text-xs sm:text-sm font-semibold tabular-nums">
                    {day}
                  </span>
                  {isLocked && !isPast && (
                    <Lock className="h-3 w-3 text-zinc-400 shrink-0" />
                  )}
                </div>
                <div className="space-y-0.5">
                  {price.ehFeriado && (
                    <span className="inline-block text-[9px] font-semibold text-[#7D6335] truncate max-w-full">
                      Feriado
                    </span>
                  )}
                  <p className="text-[10px] tabular-nums">
                    {isPast ? "Encerrado" : formatBrlShort(price.valorCentavos)}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={dateYmd}
              type="button"
              onClick={() => onSelectFreeDate(dateYmd)}
              aria-label={`Reservar ${formatDateShortPtBr(dateYmd)} por ${formatBrlShort(
                price.valorCentavos
              )}${price.ehFeriado ? ` (Feriado: ${price.feriadoNome})` : ""}`}
              className={`min-h-[68px] sm:min-h-[88px] group flex flex-col justify-between rounded-xl border p-1.5 sm:p-2.5 text-left transition-all active:scale-[0.98] ${
                isToday
                  ? "border-[#9A7D4A] bg-[#FAF7F1] ring-1 ring-[#CCB285]"
                  : "border-[#E7E2D8] bg-white hover:border-[#CCB285] hover:bg-[#FAF7F1]"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-0.5">
                <span className="font-display text-xs sm:text-sm font-bold text-[#0C0C0D] tabular-nums">
                  {day}
                </span>
                {price.ehFeriado ? (
                  <Sparkles
                    className="h-3.5 w-3.5 text-[#9A7D4A] shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-[#15803D]/70 group-hover:bg-[#15803D] shrink-0" />
                )}
              </div>

              <div className="w-full space-y-0.5">
                {price.ehFeriado && (
                  <p className="text-[9px] sm:text-[10px] font-semibold text-[#7D6335] truncate leading-tight">
                    Feriado
                  </p>
                )}
                <p className="text-[11px] sm:text-xs font-bold text-[#15803D] tabular-nums leading-tight">
                  {formatBrlShort(price.valorCentavos)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
