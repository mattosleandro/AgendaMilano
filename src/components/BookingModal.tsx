"use client";

import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  MapPin,
  Users,
  X,
} from "lucide-react";
import React, { useState } from "react";
import {
  formatBrlFromCents,
  formatDateLongPtBr,
  getRegraTarifaLabel,
} from "@/lib/agenda/pricing";
import type { Espaco, MoradorPublicSession } from "@/lib/agenda/types";

interface BookingModalProps {
  open: boolean;
  espaco: Espaco | null;
  dateYmd: string | null;
  valorCentavos: number;
  regraTarifa: string;
  feriadoNome: string | null;
  morador: MoradorPublicSession | null;
  prazoHoras: number;
  onClose: () => void;
  onBooked: () => void;
  onConflictRefresh: () => void;
}

export function BookingModal({
  open,
  espaco,
  dateYmd,
  valorCentavos,
  regraTarifa,
  feriadoNome,
  morador,
  prazoHoras,
  onClose,
  onBooked,
  onConflictRefresh,
}: BookingModalProps) {
  const [aceiteCapacidade, setAceiteCapacidade] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !espaco || !dateYmd || !morador) return null;

  const precisaAceite = espaco.exige_aceite_capacidade;
  const podeConfirmar = !submitting && (!precisaAceite || aceiteCapacidade);

  const handleConfirm = async () => {
    setError(null);
    if (precisaAceite && !aceiteCapacidade) {
      setError(
        `Confirme a ciência da capacidade máxima de ${espaco.capacidade_maxima ?? 100} pessoas.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          espacoId: espaco.id,
          dataReserva: dateYmd,
          aceiteCapacidade: precisaAceite ? aceiteCapacidade : false,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
      };

      if (!res.ok || !data.ok) {
        setError(data.message || "Não foi possível concluir a reserva.");
        if (res.status === 409 || res.status === 403) {
          onConflictRefresh();
        }
        return;
      }

      setAceiteCapacidade(false);
      onBooked();
    } catch {
      setError("Erro de conexão ao registrar reserva. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E2D8] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E7E2D8] bg-[#0C0C0D] px-5 py-4 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#CCB285]">
              Confirmar Agendamento
            </p>
            <h2 id="booking-modal-title" className="font-display text-lg font-bold">
              {espaco.nome}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de reserva"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo da reserva */}
          <div className="rounded-2xl border border-[#E7E2D8] bg-[#FAF7F1] p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-[#7D6335] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-[#52525B]">Data selecionada</p>
                <p className="font-display text-sm sm:text-base font-bold text-[#0C0C0D]">
                  {formatDateLongPtBr(dateYmd)}
                </p>
                {feriadoNome && (
                  <span className="mt-1 inline-flex items-center rounded-full bg-[#CCB285]/25 px-2.5 py-0.5 text-xs font-semibold text-[#7D6335]">
                    Feriado: {feriadoNome}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-[#7D6335] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-[#52525B]">Espaço e localização</p>
                <p className="text-sm font-semibold text-[#0C0C0D]">
                  {espaco.nome}
                </p>
                <p className="text-xs text-[#52525B]">
                  {espaco.descricao_localizacao}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-[#7D6335] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-[#52525B]">Unidade responsável</p>
                <p className="text-sm font-bold text-[#0C0C0D] tabular-nums">
                  {morador.identificacao_publica}
                </p>
                {morador.quantidade_unidades > 1 && (
                  <p className="text-[11px] text-[#7D6335] mt-0.5">
                    CPF titular de {morador.quantidade_unidades} apartamentos (limite de 1 reserva por data).
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-[#E5D5B8] pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#52525B]">
                  {getRegraTarifaLabel(regraTarifa)}
                </p>
                <p className="text-xs font-medium text-[#7D6335]">
                  Pagamento em dinheiro vivo
                </p>
              </div>
              <p className="font-display text-2xl font-bold text-[#0C0C0D] tabular-nums">
                {formatBrlFromCents(valorCentavos)}
              </p>
            </div>
          </div>

          {/* Aviso obrigatório de pagamento em espécie e expiração 48h */}
          <div className="rounded-xl border border-[#F59E0B]/40 bg-[#FFFBEB] p-3.5 text-xs text-[#92400E] flex gap-2.5">
            <Banknote className="h-5 w-5 text-[#D97706] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                Prazo de pagamento: {prazoHoras} horas corridas
              </p>
              <p>
                Sua reserva fica como <strong>Aguardando Pagamento</strong>.
                Entregue o valor em <strong>dinheiro vivo diretamente ao síndico</strong>{" "}
                em até {prazoHoras}h para receber o Recibo Digital. Se não for
                confirmado no prazo, a data volta a ficar livre automaticamente.
              </p>
            </div>
          </div>

          {/* Trava obrigatória de capacidade máxima para o Salão de Festas */}
          {precisaAceite && (
            <div className="rounded-xl border border-[#E5D5B8] bg-[#FAF7F1] p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0C0C0D]">
                <Users className="h-4 w-4 text-[#7D6335]" />
                <span>
                  Capacidade máxima: {espaco.capacidade_maxima ?? 100} pessoas
                </span>
              </div>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={aceiteCapacidade}
                  onChange={(e) => {
                    setError(null);
                    setAceiteCapacidade(e.target.checked);
                  }}
                  className="mt-0.5 h-5 w-5 rounded border-[#9A7D4A] accent-[#0C0C0D] shrink-0"
                />
                <span className="text-xs leading-relaxed text-[#18181B]">
                  Declaro ciência de que a capacidade máxima do Salão de Festas é
                  de <strong>{espaco.capacidade_maxima ?? 100} pessoas</strong> e
                  comprometo-me a respeitar este limite durante todo o evento.
                </span>
              </label>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs font-medium text-[#B91C1C]"
            >
              {error.includes("reservada") || error.includes("limite") ? (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-12 flex-1 rounded-xl border border-[#E7E2D8] bg-white text-sm font-semibold text-[#52525B] hover:bg-zinc-50 transition-colors"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!podeConfirmar}
              className="h-12 flex-[1.6] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0C0C0D] px-4 text-sm font-semibold text-white hover:bg-[#1E1E22] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle2 className="h-4 w-4 text-[#CCB285]" />
              <span>
                {submitting ? "Reservando..." : "Solicitar Reserva"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
