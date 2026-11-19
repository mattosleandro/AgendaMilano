"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  Copy,
  Printer,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import {
  formatBrlFromCents,
  formatDateLongPtBr,
  formatDateTimeCampoGrande,
} from "@/lib/agenda/pricing";
import type { ReciboVerificacaoResponse } from "@/lib/agenda/types";
import { MilanoLogo } from "./MilanoLogo";

interface ReceiptDocumentProps {
  data: ReciboVerificacaoResponse;
}

export function ReceiptDocument({ data }: ReceiptDocumentProps) {
  const [copied, setCopied] = useState(false);
  const { recibo, integridade_valida, status_reserva, cancelado_em } = data;
  const isCancelled = status_reserva === "CANCELADO";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback silencioso se clipboard API não estiver disponível
    }
  };

  return (
    <div className="min-h-dvh bg-[#F8F7F4] py-6 px-3 sm:px-4">
      <div className="mx-auto max-w-2xl space-y-4">
        {/* Barra de ações (oculta na impressão/PDF) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E7E2D8] bg-white px-4 text-xs sm:text-sm font-semibold text-[#0C0C0D] hover:bg-[#FAF7F1] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Voltar para Agenda</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#E7E2D8] bg-white px-4 text-xs sm:text-sm font-semibold text-[#0C0C0D] hover:bg-[#FAF7F1] transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[#15803D]" />
                  <span>Link copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-[#7D6335]" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0C0C0D] px-4 text-xs sm:text-sm font-semibold text-white hover:bg-[#1E1E22] transition-colors"
            >
              <Printer className="h-4 w-4 text-[#CCB285]" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>

        {/* Documento do Recibo Auditável */}
        <article className="relative overflow-hidden rounded-2xl border border-[#E5D5B8] bg-white shadow-sm">
          <div className="h-2 w-full bg-gradient-to-r from-[#0C0C0D] via-[#CCB285] to-[#0C0C0D]" />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Cabeçalho */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E7E2D8] pb-5">
              <div className="space-y-1.5">
                <MilanoLogo variant="full-dark" className="h-10 w-auto" />
                <p className="text-xs text-[#52525B]">
                  Comprovante Digital de Quitação de Área Comum
                </p>
              </div>
              <div className="sm:text-right">
                <span className="block text-[11px] uppercase tracking-wider font-semibold text-[#7D6335]">
                  Código do Recibo
                </span>
                <span className="font-mono text-base sm:text-lg font-bold text-[#0C0C0D]">
                  {recibo.codigo_recibo}
                </span>
              </div>
            </header>

            {/* Selo de Status e Integridade */}
            {isCancelled ? (
              <div className="rounded-xl border border-red-200 bg-[#FEF2F2] p-4 flex items-start gap-3 text-[#B91C1C]">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm space-y-0.5">
                  <p className="font-bold">
                    ATENÇÃO: RESERVA POSTERIORMENTE CANCELADA
                  </p>
                  <p>
                    Este recibo foi emitido em{" "}
                    {formatDateTimeCampoGrande(recibo.emitido_em)}, porém a
                    reserva foi cancelada em{" "}
                    {cancelado_em
                      ? formatDateTimeCampoGrande(cancelado_em)
                      : "data posterior"}
                    .
                  </p>
                </div>
              </div>
            ) : integridade_valida ? (
              <div className="rounded-xl border border-[#15803D]/30 bg-[#F0FDF4] p-4 flex items-center justify-between gap-3 text-[#166534]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 shrink-0 text-[#15803D]" />
                  <div>
                    <p className="font-display text-sm font-bold">
                      PAGO EM ESPÉCIE — RESERVA CONFIRMADA
                    </p>
                    <p className="text-xs">
                      Assinatura criptográfica SHA-256 validada com sucesso.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-red-200 bg-[#FEF2F2] p-4 text-sm font-bold text-[#B91C1C]">
                Falha na verificação de integridade do documento.
              </div>
            )}

            {/* Dados do Recibo (Estritamente sem PII - LGPD) */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E7E2D8] bg-[#FAF7F1] p-4 sm:p-5">
              <div>
                <dt className="text-xs text-[#52525B]">Unidade Responsável</dt>
                <dd className="mt-0.5 font-display text-base font-bold text-[#0C0C0D] tabular-nums">
                  {recibo.identificacao_publica}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[#52525B]">Valor Recebido</dt>
                <dd className="mt-0.5 font-display text-xl font-bold text-[#0C0C0D] tabular-nums">
                  {formatBrlFromCents(recibo.valor_centavos)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[#52525B]">Área Comum Reservada</dt>
                <dd className="mt-0.5 text-sm font-bold text-[#0C0C0D]">
                  {recibo.espaco_nome}
                </dd>
                <dd className="text-xs text-[#52525B]">
                  {recibo.espaco_descricao}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[#52525B]">Data da Utilização</dt>
                <dd className="mt-0.5 text-sm font-bold text-[#0C0C0D]">
                  {formatDateLongPtBr(recibo.data_reserva)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[#52525B]">Forma de Pagamento</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#18181B] inline-flex items-center gap-1.5">
                  <Banknote className="h-4 w-4 text-[#7D6335]" />
                  Dinheiro vivo (recebido pelo síndico)
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[#52525B]">
                  Data/Hora da Confirmação
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-[#18181B] tabular-nums">
                  {formatDateTimeCampoGrande(recibo.emitido_em)}
                </dd>
              </div>
            </dl>

            {/* Bloco Criptográfico de Auditoria */}
            <div className="rounded-xl border border-[#E7E2D8] bg-zinc-50 p-4 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#52525B]">
                Selo Criptográfico Auditável (SHA-256)
              </p>
              <p className="font-mono text-[11px] sm:text-xs break-all text-[#0C0C0D] select-all">
                {recibo.hash_sha256}
              </p>
              <p className="text-[11px] text-[#71717A]">
                Documento gerado automaticamente pelo sistema oficial de agendamento
                do Milano Condomínio Club. Em conformidade com a LGPD, este
                comprovante exibe apenas a identificação da unidade (Bloco e
                Apartamento).
              </p>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
