"use client";

import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { formatCountdownParts } from "@/lib/agenda/opening-window";
import {
  formatBrlFromCents,
  formatDateShortPtBr,
  formatDateTimeCampoGrande,
} from "@/lib/agenda/pricing";
import type {
  AdminReservaItem,
  Espaco,
  ReciboDigital,
} from "@/lib/agenda/types";

interface AdminReservationsClientProps {
  initialReservas: AdminReservaItem[];
  espacos: Espaco[];
  initialServerNow: string;
}

export function AdminReservationsClient({
  initialReservas,
  espacos,
  initialServerNow,
}: AdminReservationsClientProps) {
  const [reservas, setReservas] = useState<AdminReservaItem[]>(initialReservas);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [espacoFilter, setEspacoFilter] = useState<string>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [serverOffsetMs, setServerOffsetMs] = useState(
    () => Date.parse(initialServerNow) - Date.now()
  );
  const [syncedNowMs, setSyncedNowMs] = useState(() =>
    Date.parse(initialServerNow)
  );

  // Modais
  const [confirmTarget, setConfirmTarget] = useState<AdminReservaItem | null>(
    null
  );
  const [cancelTarget, setCancelTarget] = useState<AdminReservaItem | null>(
    null
  );
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [issuedReceipt, setIssuedReceipt] = useState<ReciboDigital | null>(
    null
  );
  const [copiedMsg, setCopiedMsg] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSyncedNowMs(Date.now() + serverOffsetMs);
    }, 1000);
    return () => clearInterval(id);
  }, [serverOffsetMs]);

  const reloadReservas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reservas", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        reservas?: AdminReservaItem[];
        serverNow?: string;
      };
      if (data.reservas) setReservas(data.reservas);
      if (data.serverNow) {
        const offset = Date.parse(data.serverNow) - Date.now();
        setServerOffsetMs(offset);
        setSyncedNowMs(Date.now() + offset);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const enriched = useMemo(() => {
    return reservas.map((r) => {
      const remainingMs = Math.max(0, Date.parse(r.expires_at) - syncedNowMs);
      const eff =
        r.status === "PENDENTE_PAGAMENTO" && remainingMs === 0
          ? "EXPIRADO"
          : r.status;
      return { ...r, status_efetivo: eff, remainingMs };
    });
  }, [reservas, syncedNowMs]);

  const stats = useMemo(() => {
    let pendentesCount = 0;
    let pendentesCentavos = 0;
    let confirmadasCount = 0;
    let confirmadasCentavos = 0;
    let encerradasCount = 0;

    for (const r of enriched) {
      if (r.status_efetivo === "PENDENTE_PAGAMENTO") {
        pendentesCount++;
        pendentesCentavos += r.valor_centavos;
      } else if (r.status_efetivo === "CONFIRMADO") {
        confirmadasCount++;
        confirmadasCentavos += r.valor_centavos;
      } else {
        encerradasCount++;
      }
    }

    return {
      pendentesCount,
      pendentesCentavos,
      confirmadasCount,
      confirmadasCentavos,
      encerradasCount,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = enriched.filter((r) => {
      if (statusFilter !== "ALL" && r.status_efetivo !== statusFilter) {
        return false;
      }
      if (espacoFilter !== "ALL" && r.espaco_id !== espacoFilter) {
        return false;
      }
      if (monthFilter && !r.data_reserva.startsWith(monthFilter)) {
        return false;
      }
      if (q) {
        const match =
          r.identificacao_publica.toLowerCase().includes(q) ||
          `${r.bloco}/${r.apartamento}`.includes(q) ||
          (r.codigo_recibo ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    if (statusFilter === "PENDENTE_PAGAMENTO") {
      list.sort((a, b) => a.remainingMs - b.remainingMs);
    }
    return list;
  }, [enriched, statusFilter, espacoFilter, monthFilter, search]);

  const handleConfirmCash = async () => {
    if (!confirmTarget) return;
    setActionError(null);
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/admin/reservas/${confirmTarget.id}/confirmar`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        recibo?: ReciboDigital;
      };

      if (!res.ok || !data.ok || !data.recibo) {
        setActionError(data.message || "Não foi possível confirmar o pagamento.");
        await reloadReservas();
        return;
      }

      setConfirmTarget(null);
      setIssuedReceipt(data.recibo);
      await reloadReservas();
    } catch {
      setActionError("Erro de rede ao confirmar pagamento.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setActionError(null);
    if (cancelMotivo.trim().length < 3) {
      setActionError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }

    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/admin/reservas/${cancelTarget.id}/cancelar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: cancelMotivo.trim() }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setActionError(data.message || "Não foi possível cancelar a reserva.");
        return;
      }
      setCancelTarget(null);
      setCancelMotivo("");
      await reloadReservas();
    } catch {
      setActionError("Erro de rede ao cancelar reserva.");
    } finally {
      setActionBusy(false);
    }
  };

  const copyWhatsAppReceiptMessage = async (recibo: ReciboDigital) => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://agenda.portalmilano.com";
    const text = [
      `✅ *Milano Condomínio Club — Pagamento Confirmado*`,
      `Recibo: *${recibo.codigo_recibo}*`,
      `Unidade: *${recibo.identificacao_publica}*`,
      `Espaço: *${recibo.espaco_nome}*`,
      `Data: *${formatDateShortPtBr(recibo.data_reserva)}*`,
      `Valor pago em espécie: *${formatBrlFromCents(recibo.valor_centavos)}*`,
      `Comprovante digital: ${origin}/recibo/${recibo.codigo_recibo}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    } catch {
      // Silencioso
    }
  };

  return (
    <div className="space-y-5">
      {/* Banner de recibo recém-emitido */}
      {issuedReceipt && (
        <div
          role="status"
          className="rounded-2xl border border-[#15803D]/35 bg-[#F0FDF4] p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <p className="font-display text-sm sm:text-base font-bold text-[#166534] flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
              <span>
                Pagamento confirmado e Recibo {issuedReceipt.codigo_recibo} emitido!
              </span>
            </p>
            <p className="text-xs text-[#166534]">
              {issuedReceipt.identificacao_publica} • {issuedReceipt.espaco_nome}{" "}
              • {formatDateShortPtBr(issuedReceipt.data_reserva)} •{" "}
              <strong className="tabular-nums">
                {formatBrlFromCents(issuedReceipt.valor_centavos)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyWhatsAppReceiptMessage(issuedReceipt)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#15803D]/30 bg-white px-3 text-xs font-semibold text-[#166534] hover:bg-[#FAF7F1]"
            >
              {copiedMsg ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Texto WhatsApp copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar p/ WhatsApp</span>
                </>
              )}
            </button>

            <Link
              href={`/recibo/${issuedReceipt.codigo_recibo}`}
              target="_blank"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0C0C0D] px-4 text-xs font-semibold text-white hover:bg-[#1E1E22]"
            >
              <FileText className="h-4 w-4 text-[#CCB285]" />
              <span>Abrir Recibo</span>
            </Link>

            <button
              type="button"
              onClick={() => setIssuedReceipt(null)}
              aria-label="Dispensar aviso"
              className="p-2 text-[#166534] hover:opacity-70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* KPIs Operacionais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter("PENDENTE_PAGAMENTO")}
          className="text-left rounded-2xl border border-[#F59E0B]/40 bg-[#FFFBEB] p-4 transition-all hover:brightness-95"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#92400E]">
            Aguardando Pagamento (48h)
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-[#92400E] tabular-nums">
            {stats.pendentesCount}
          </p>
          <p className="mt-0.5 text-xs text-[#92400E]/90 tabular-nums">
            A receber: {formatBrlFromCents(stats.pendentesCentavos)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("CONFIRMADO")}
          className="text-left rounded-2xl border border-[#15803D]/30 bg-[#F0FDF4] p-4 transition-all hover:brightness-95"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#166534]">
            Confirmadas (Dinheiro)
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-[#166534] tabular-nums">
            {stats.confirmadasCount}
          </p>
          <p className="mt-0.5 text-xs text-[#166534]/90 tabular-nums">
            Arrecadado: {formatBrlFromCents(stats.confirmadasCentavos)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter("ALL")}
          className="text-left rounded-2xl border border-[#E7E2D8] bg-white p-4 transition-all hover:bg-[#FAF7F1]"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[#52525B]">
            Total / Expiradas e Canceladas
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-[#0C0C0D] tabular-nums">
            {enriched.length}{" "}
            <span className="text-sm font-normal text-[#71717A]">
              ({stats.encerradasCount} encerradas)
            </span>
          </p>
          <p className="mt-0.5 text-xs text-[#52525B]">
            Clique para mostrar todas
          </p>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-2xl border border-[#E7E2D8] bg-white p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "ALL", label: "Todas" },
              {
                value: "PENDENTE_PAGAMENTO",
                label: `Pendentes (${stats.pendentesCount})`,
              },
              { value: "CONFIRMADO", label: "Confirmadas" },
              { value: "EXPIRADO", label: "Expiradas" },
              { value: "CANCELADO", label: "Canceladas" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`h-9 rounded-xl px-3 text-xs font-semibold transition-colors ${
                  statusFilter === tab.value
                    ? "bg-[#0C0C0D] text-white"
                    : "bg-[#F8F7F4] text-[#52525B] hover:bg-[#EFECE4]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void reloadReservas()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E7E2D8] px-3 text-xs font-semibold text-[#0C0C0D] hover:bg-[#FAF7F1]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar Bloco/Apto ou MIL-..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-xl border border-[#D4CFC4] pl-9 pr-3 text-xs sm:text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filtrar por espaço"
            value={espacoFilter}
            onChange={(e) => setEspacoFilter(e.target.value)}
            className="h-10 rounded-xl border border-[#D4CFC4] bg-white px-3 text-xs sm:text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none"
          >
            <option value="ALL">Todos os espaços</option>
            {espacos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="month"
              aria-label="Filtrar por mês"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-[#D4CFC4] bg-white px-3 text-xs sm:text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none"
            />
            {monthFilter && (
              <button
                type="button"
                onClick={() => setMonthFilter("")}
                className="text-xs font-semibold text-[#7D6335] underline"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista de Reservas */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E7E2D8] bg-white p-8 text-center text-sm text-[#52525B]">
            Nenhuma reserva encontrada para os filtros selecionados.
          </div>
        ) : (
          filtered.map((r) => {
            const c = formatCountdownParts(r.remainingMs);
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-xs flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-[#0C0C0D] tabular-nums">
                      {formatDateShortPtBr(r.data_reserva)}
                    </span>
                    <span className="rounded-lg bg-[#FAF7F1] border border-[#E5D5B8] px-2 py-0.5 text-xs font-bold text-[#0C0C0D]">
                      {r.espaco_nome}
                    </span>
                    <span className="text-sm font-bold text-[#0C0C0D] tabular-nums">
                      {r.identificacao_publica}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#52525B]">
                    <span>
                      Valor:{" "}
                      <strong className="text-[#0C0C0D] tabular-nums">
                        {formatBrlFromCents(r.valor_centavos)}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Solicitada em:{" "}
                      <span className="tabular-nums">
                        {formatDateTimeCampoGrande(r.created_at).slice(0, 16)}
                      </span>
                    </span>
                  </div>

                  {r.status_efetivo === "PENDENTE_PAGAMENTO" && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#92400E] tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-[#D97706]" />
                      <span>
                        Expira em {c.days * 24 + c.hours}h{" "}
                        {String(c.minutes).padStart(2, "0")}m{" "}
                        {String(c.seconds).padStart(2, "0")}s
                      </span>
                    </p>
                  )}

                  {r.status_efetivo === "CONFIRMADO" && r.confirmado_em && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534] tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#15803D]" />
                      <span>
                        Pago em espécie em{" "}
                        {formatDateTimeCampoGrande(r.confirmado_em).slice(0, 16)}
                      </span>
                    </p>
                  )}

                  {r.status_efetivo === "EXPIRADO" && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Expirado automaticamente após 48h</span>
                    </p>
                  )}

                  {r.status_efetivo === "CANCELADO" && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C]">
                      <XCircle className="h-3.5 w-3.5" />
                      <span>Cancelado: {r.motivo_cancelamento}</span>
                    </p>
                  )}
                </div>

                {/* Ações do Síndico */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {r.status_efetivo === "PENDENTE_PAGAMENTO" && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setConfirmTarget(r);
                      }}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#15803D] px-4 text-xs sm:text-sm font-bold text-white hover:bg-[#166534] transition-colors"
                    >
                      <Banknote className="h-4 w-4" />
                      <span>Confirmar Pagamento (Dinheiro)</span>
                    </button>
                  )}

                  {r.codigo_recibo && (
                    <Link
                      href={`/recibo/${r.codigo_recibo}`}
                      target="_blank"
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#0C0C0D] px-4 text-xs font-semibold text-white hover:bg-[#1E1E22] transition-colors"
                    >
                      <FileText className="h-4 w-4 text-[#CCB285]" />
                      <span>Recibo ({r.codigo_recibo})</span>
                    </Link>
                  )}

                  {(r.status_efetivo === "PENDENTE_PAGAMENTO" ||
                    r.status_efetivo === "CONFIRMADO") && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setCancelMotivo("");
                        setCancelTarget(r);
                      }}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-100 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Cancelar</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Confirmação de Recebimento em Espécie */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E2D8] bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#0C0C0D] px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                Confirmar Recebimento em Espécie
              </h3>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="text-zinc-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF7F1] p-4 space-y-1.5 text-sm">
                <p>
                  <span className="text-[#52525B]">Unidade:</span>{" "}
                  <strong className="text-[#0C0C0D] tabular-nums">
                    {confirmTarget.identificacao_publica}
                  </strong>
                </p>
                <p>
                  <span className="text-[#52525B]">Espaço:</span>{" "}
                  <strong className="text-[#0C0C0D]">
                    {confirmTarget.espaco_nome}
                  </strong>
                </p>
                <p>
                  <span className="text-[#52525B]">Data:</span>{" "}
                  <strong className="text-[#0C0C0D] tabular-nums">
                    {formatDateShortPtBr(confirmTarget.data_reserva)}
                  </strong>
                </p>
                <p className="pt-1 border-t border-[#E5D5B8] flex items-center justify-between">
                  <span className="text-[#52525B]">Valor em dinheiro:</span>
                  <strong className="font-display text-xl text-[#15803D] tabular-nums">
                    {formatBrlFromCents(confirmTarget.valor_centavos)}
                  </strong>
                </p>
              </div>

              {actionError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs font-medium text-[#B91C1C]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmTarget(null)}
                  disabled={actionBusy}
                  className="h-11 flex-1 rounded-xl border border-[#E7E2D8] text-sm font-semibold text-[#52525B]"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCash}
                  disabled={actionBusy}
                  className="h-11 flex-[1.5] rounded-xl bg-[#15803D] text-sm font-bold text-white hover:bg-[#166534] disabled:opacity-50"
                >
                  {actionBusy ? "Confirmando..." : "Confirmar e Gerar Recibo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento Auditado */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E7E2D8] bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#0C0C0D] px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                Cancelar Reserva
              </h3>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-zinc-300 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCancelReservation} className="p-5 space-y-4">
              <p className="text-xs text-[#52525B]">
                Ao cancelar a reserva de{" "}
                <strong className="text-[#0C0C0D]">
                  {cancelTarget.identificacao_publica}
                </strong>{" "}
                em{" "}
                <strong className="text-[#0C0C0D]">
                  {formatDateShortPtBr(cancelTarget.data_reserva)}
                </strong>{" "}
                ({cancelTarget.espaco_nome}), a data voltará a ficar imediatamente
                disponível na agenda.
              </p>

              <div>
                <label
                  htmlFor="cancel-motivo"
                  className="block text-xs font-semibold text-[#18181B] mb-1"
                >
                  Motivo do cancelamento (obrigatório para auditoria)
                </label>
                <textarea
                  id="cancel-motivo"
                  rows={3}
                  required
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  placeholder="Ex: Morador solicitou desistência antes do prazo."
                  className="w-full rounded-xl border border-[#D4CFC4] p-3 text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none"
                />
              </div>

              {actionError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs font-medium text-[#B91C1C]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCancelTarget(null)}
                  disabled={actionBusy}
                  className="h-11 flex-1 rounded-xl border border-[#E7E2D8] text-sm font-semibold text-[#52525B]"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="h-11 flex-[1.5] rounded-xl bg-[#B91C1C] text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
                >
                  {actionBusy ? "Cancelando..." : "Confirmar Cancelamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
