"use client";

import { Clock, Lock } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatCountdownParts } from "@/lib/agenda/opening-window";
import {
  formatDateTimeShortPtBr,
  formatMonthYearPtBr,
} from "@/lib/agenda/pricing";

interface CountdownBannerProps {
  year: number;
  month: number;
  openingAt: string;
  serverOffsetMs: number;
  onUnlocked: () => void;
}

export function CountdownBanner({
  year,
  month,
  openingAt,
  serverOffsetMs,
  onUnlocked,
}: CountdownBannerProps) {
  const targetMs = Date.parse(openingAt);
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, targetMs - (Date.now() + serverOffsetMs))
  );

  useEffect(() => {
    let triggered = false;
    const tick = () => {
      const syncedNow = Date.now() + serverOffsetMs;
      const diff = Math.max(0, targetMs - syncedNow);
      setRemainingMs(diff);
      if (diff === 0 && !triggered) {
        triggered = true;
        onUnlocked();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetMs, serverOffsetMs, onUnlocked]);

  const parts = formatCountdownParts(remainingMs);
  const monthLabel = formatMonthYearPtBr(year, month);
  const openingText = formatDateTimeShortPtBr(openingAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[#CCB285]/60 bg-[#0C0C0D] p-4 sm:p-5 text-white shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#CCB285]/15 text-[#CCB285]">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-[#CCB285] uppercase tracking-wide">
              Lote ainda não liberado
            </p>
            <h2 className="font-display text-base sm:text-lg font-bold text-white">
              Agendamentos para {monthLabel}
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-zinc-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#CCB285] shrink-0" />
              <span>
                Abertura automática em{" "}
                <strong className="text-white tabular-nums">{openingText}</strong>
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 self-stretch sm:self-auto">
          {[
            { label: "Dias", value: parts.days },
            { label: "Horas", value: parts.hours },
            { label: "Min", value: parts.minutes },
            { label: "Seg", value: parts.seconds },
          ].map((item) => (
            <div
              key={item.label}
              className="flex min-w-[56px] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#1E1E22] px-2.5 py-2"
            >
              <span className="font-display text-lg sm:text-xl font-bold text-[#CCB285] tabular-nums leading-none">
                {String(item.value).padStart(2, "0")}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
