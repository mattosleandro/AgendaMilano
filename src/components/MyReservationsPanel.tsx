"use client";

import {
  CheckCircle2,
  Clock,
  FileText,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import React from "react";
import { formatCountdownParts } from "@/lib/agenda/opening-window";
import {
  formatBrlFromCents,
  formatDateShortPtBr,
  formatDateTimeCampoGrande,
} from "@/lib/agenda/pricing";
import type { MinhaReserva } from "@/lib/agenda/types";

interface MyReservationsPanelProps {
  reservas: MinhaReserva[];
  syncedNowMs: number;
  loading: boolean;
}

function StatusBadge({ status }: { status: MinhaReserva["status"] }) {
  switch (status) {
    case "CONFIRMADO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F0FDF4] border border-[#15803D]/30 px-2.5 py-1 text-xs font-semibold text-[#166534]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmado
        </span>
      );
    case "PENDENTE_PAGAMENTO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] border border-[#F59E0B]/40 px-2.5 py-1 text-xs font-semibold text-[#92400E]">
          <Clock className="h-3.5 w-3.5" />
          Aguardando Pagamento
        </span>
      );
    case "EXPIRADO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-600">
          <Clock className="h-3.5 w-3.5" />
          Expirado (48h)
        </span>
      );
    case "CANCELADO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] border border-red-200 px-2.5 py-1 text-xs font-semibold text-[#B91C1C]">
          <XCircle className="h-3.5 w-3.5" />
          Cancelado
        </span>
      );
  }
}

export function MyReservationsPanel({
  reservas,
  syncedNowMs,
  loading,
}: MyReservationsPanelProps) {
  return (
    <section
      aria-labelledby="minhas-reservas-heading"
      className="rounded-2xl border border-[#E7E2D8] bg-white p-4 sm:p-5 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            id="minhas-reservas-heading"
            className="font-display text-base sm:text-lg font-bold text-[#0C0C0D]"
          >
            Minhas Reservas
          </h2>
          <p className="text-xs text-[#52525B]">
            Acompanhe prazos de pagamento em espécie e emita seus recibos
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-[#52525B]">
          Carregando reservas da sua unidade...
        </div>
      ) : reservas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7E2D8] bg-[#FAF7F1] p-5 text-center text-sm text-[#52525B]">
          Você ainda não possui reservas registradas para este CPF. Toque em um
          dia disponível no calendário para agendar.
        </div>
      ) : (
        <div className="space-y-2.5">
          {reservas.map((r) => {
            const remainingMs = Math.max(
              0,
              Date.parse(r.expires_at) - syncedNowMs
            );
            const effStatus =
              r.status === "PENDENTE_PAGAMENTO" && remainingMs === 0
                ? "EXPIRADO"
                : r.status;
            const c = formatCountdownParts(remainingMs);

            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-[#E7E2D8] bg-[#FAF7F1]/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold text-[#0C0C0D] tabular-nums">
                      {formatDateShortPtBr(r.data_reserva)}
                    </span>
                    <span className="text-sm font-semibold text-[#18181B]">
                      • {r.espaco_nome}
                    </span>
                    <StatusBadge status={effStatus} />
                  </div>
                  <p className="text-xs text-[#52525B]">
                    {r.espaco_descricao} • Valor:{" "}
                    <strong className="text-[#0C0C0D] tabular-nums">
                      {formatBrlFromCents(r.valor_centavos)}
                    </strong>{" "}
                    (em espécie ao síndico)
                  </p>
                  {effStatus === "PENDENTE_PAGAMENTO" && (
                    <p className="text-xs font-semibold text-[#92400E] tabular-nums">
                      Expira em {c.days * 24 + c.hours}h{" "}
                      {String(c.minutes).padStart(2, "0")}m{" "}
                      {String(c.seconds).padStart(2, "0")}s (limite:{" "}
                      {formatDateTimeCampoGrande(r.expires_at).slice(0, 16)})
                    </p>
                  )}
                  {effStatus === "CANCELADO" && r.motivo_cancelamento && (
                    <p className="text-xs text-[#B91C1C]">
                      Motivo: {r.motivo_cancelamento}
                    </p>
                  )}
                </div>

                {r.codigo_recibo && (
                  <Link
                    href={`/recibo/${r.codigo_recibo}`}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0C0C0D] px-4 text-xs font-semibold text-white hover:bg-[#1E1E22] shrink-0 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-[#CCB285]" />
                    <span>Ver Recibo ({r.codigo_recibo})</span>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
