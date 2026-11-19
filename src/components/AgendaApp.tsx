"use client";

import {
  AlertCircle,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Info,
  LogOut,
  MapPin,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addMonths } from "@/lib/agenda/opening-window";
import {
  calculateSpacePrice,
  formatBrlShort,
  formatDateLongPtBr,
  formatDateShortPtBr,
  formatDateTimeShortPtBr,
  formatMonthYearPtBr,
} from "@/lib/agenda/pricing";
import type {
  AgendaMesResponse,
  FeriadoPublico,
  MinhaReserva,
  MoradorPublicSession,
} from "@/lib/agenda/types";
import { BookingModal } from "./BookingModal";
import { CalendarGrid } from "./CalendarGrid";
import { CountdownBanner } from "./CountdownBanner";
import { CpfModal } from "./CpfModal";
import { MilanoLogo } from "./MilanoLogo";
import { MyReservationsPanel } from "./MyReservationsPanel";

interface AgendaAppProps {
  initialAgenda: AgendaMesResponse;
  initialMorador: MoradorPublicSession | null;
  initialMinhasReservas: MinhaReserva[];
}

export function AgendaApp({
  initialAgenda,
  initialMorador,
  initialMinhasReservas,
}: AgendaAppProps) {
  const [agenda, setAgenda] = useState<AgendaMesResponse>(initialAgenda);
  const [selectedEspacoId, setSelectedEspacoId] = useState<string>(
    initialAgenda.espacos[0]?.id ?? ""
  );
  const [morador, setMorador] = useState<MoradorPublicSession | null>(
    initialMorador
  );
  const [minhasReservas, setMinhasReservas] = useState<MinhaReserva[]>(
    initialMinhasReservas
  );
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingMinhas, setLoadingMinhas] = useState(false);

  // Offset de relógio em relação ao servidor (impede distorções pelo relógio local)
  const [serverOffsetMs, setServerOffsetMs] = useState(() =>
    Date.parse(initialAgenda.serverNow) - Date.now()
  );
  const [syncedNowMs, setSyncedNowMs] = useState(() =>
    Date.parse(initialAgenda.serverNow)
  );

  // Modais e seleções
  const [cpfModalOpen, setCpfModalOpen] = useState(false);
  const [pendingDateAfterCpf, setPendingDateAfterCpf] = useState<string | null>(
    null
  );
  const [bookingDate, setBookingDate] = useState<string | null>(null);
  const [selectedOccupiedDate, setSelectedOccupiedDate] = useState<string | null>(
    null
  );
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [confirmBannerCancel, setConfirmBannerCancel] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSyncedNowMs(Date.now() + serverOffsetMs);
    }, 1000);
    return () => clearInterval(id);
  }, [serverOffsetMs]);

  const currentYearMonth = useMemo(() => {
    const [y, m] = initialAgenda.todayLocal.split("-").map(Number);
    return { year: y, month: m };
  }, [initialAgenda.todayLocal]);

  const espacoAtivo = useMemo(
    () =>
      agenda.espacos.find((e) => e.id === selectedEspacoId) ??
      agenda.espacos[0] ??
      null,
    [agenda.espacos, selectedEspacoId]
  );

  const holidayMap = useMemo(() => {
    const map = new Map<string, FeriadoPublico>();
    for (const f of agenda.feriados) {
      if (f.ativo) map.set(f.data, f);
    }
    return map;
  }, [agenda.feriados]);

  const fetchMonth = useCallback(async (year: number, month: number) => {
    setLoadingMonth(true);
    setSelectedOccupiedDate(null);
    try {
      const res = await fetch(`/api/agenda?year=${year}&month=${month}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as AgendaMesResponse;
      setAgenda(data);
      const offset = Date.parse(data.serverNow) - Date.now();
      setServerOffsetMs(offset);
      setSyncedNowMs(Date.now() + offset);
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  const fetchMinhasReservas = useCallback(async () => {
    setLoadingMinhas(true);
    try {
      const res = await fetch("/api/reservas", { cache: "no-store" });
      if (res.status === 401) {
        setMorador(null);
        setMinhasReservas([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { reservas?: MinhaReserva[] };
      setMinhasReservas(data.reservas ?? []);
    } finally {
      setLoadingMinhas(false);
    }
  }, []);

  const handleMonthStep = (delta: number) => {
    const next = addMonths(agenda.year, agenda.month, delta);
    const minVal = currentYearMonth.year * 12 + currentYearMonth.month;
    const maxVal = minVal + 3;
    const nextVal = next.year * 12 + next.month;
    if (nextVal < minVal || nextVal > maxVal) return;
    void fetchMonth(next.year, next.month);
  };

  const canGoPrev =
    agenda.year * 12 + agenda.month >
    currentYearMonth.year * 12 + currentYearMonth.month;
  const canGoNext =
    agenda.year * 12 + agenda.month <
    currentYearMonth.year * 12 + currentYearMonth.month + 3;

  const handleSelectFreeDate = (dateYmd: string) => {
    setSelectedOccupiedDate(null);
    setFeedbackBanner(null);
    setErrorBanner(null);
    if (!morador) {
      setPendingDateAfterCpf(dateYmd);
      setCpfModalOpen(true);
      return;
    }
    setBookingDate(dateYmd);
  };

  const handleCancelOwnReservation = async (reserva: MinhaReserva) => {
    setErrorBanner(null);
    setFeedbackBanner(null);
    setCancelingId(reserva.id);
    try {
      const res = await fetch(`/api/reservas/${reserva.id}/cancelar`, {
        method: "POST",
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setErrorBanner(
          data.message || "Não foi possível excluir esta reserva."
        );
        return;
      }
      setSelectedOccupiedDate(null);
      setConfirmBannerCancel(false);
      setFeedbackBanner(
        data.message ||
          `Reserva de ${formatDateShortPtBr(reserva.data_reserva)} excluída. A data e sua cota mensal foram liberadas.`
      );
      await Promise.all([
        fetchMonth(agenda.year, agenda.month),
        fetchMinhasReservas(),
      ]);
    } catch {
      setErrorBanner("Erro de conexão ao excluir reserva. Tente novamente.");
    } finally {
      setCancelingId(null);
    }
  };

  const handleCpfSuccess = (loggedMorador: MoradorPublicSession) => {
    setMorador(loggedMorador);
    setCpfModalOpen(false);
    void fetchMinhasReservas();
    if (pendingDateAfterCpf) {
      setBookingDate(pendingDateAfterCpf);
      setPendingDateAfterCpf(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setMorador(null);
    setMinhasReservas([]);
    setBookingDate(null);
  };

  const handleBooked = () => {
    const bookedDay = bookingDate;
    setBookingDate(null);
    setFeedbackBanner(
      bookedDay
        ? `Pré-reserva registrada para ${formatDateShortPtBr(
            bookedDay
          )}! Entregue o pagamento em dinheiro ao síndico em até ${
            agenda.config.prazo_pagamento_horas
          }h.`
        : "Pré-reserva registrada com sucesso!"
    );
    void fetchMonth(agenda.year, agenda.month);
    void fetchMinhasReservas();
  };

  const occupiedListForSpace = useMemo(() => {
    if (!espacoAtivo) return [];
    return agenda.reservas.filter((r) => {
      if (r.espaco_id !== espacoAtivo.id) return false;
      if (
        r.status_efetivo === "PENDENTE_PAGAMENTO" &&
        Date.parse(r.expires_at) <= syncedNowMs
      ) {
        return false;
      }
      return true;
    });
  }, [agenda.reservas, espacoAtivo, syncedNowMs]);

  const inspectedOccupied = useMemo(() => {
    if (!selectedOccupiedDate) return null;
    return (
      occupiedListForSpace.find(
        (r) => r.data_reserva === selectedOccupiedDate
      ) ?? null
    );
  }, [occupiedListForSpace, selectedOccupiedDate]);

  const bookingPriceInfo = useMemo(() => {
    if (!espacoAtivo || !bookingDate) return null;
    return calculateSpacePrice(espacoAtivo, bookingDate, holidayMap);
  }, [espacoAtivo, bookingDate, holidayMap]);

  const holidaysInMonth = useMemo(() => {
    const prefix = `${agenda.year}-${String(agenda.month).padStart(2, "0")}-`;
    return agenda.feriados.filter((f) => f.ativo && f.data.startsWith(prefix));
  }, [agenda.feriados, agenda.year, agenda.month]);

  const myActiveInSpaceMonth = useMemo(() => {
    if (!morador || !espacoAtivo) return null;
    const prefix = `${agenda.year}-${String(agenda.month).padStart(2, "0")}-`;
    return (
      minhasReservas.find((r) => {
        if (r.espaco_id !== espacoAtivo.id) return false;
        if (!r.data_reserva.startsWith(prefix)) return false;
        if (r.status === "CONFIRMADO") return true;
        if (
          r.status === "PENDENTE_PAGAMENTO" &&
          Date.parse(r.expires_at) > syncedNowMs
        ) {
          return true;
        }
        return false;
      }) ?? null
    );
  }, [morador, espacoAtivo, minhasReservas, agenda.year, agenda.month, syncedNowMs]);

  const inspectedOwnPending = useMemo(() => {
    if (!inspectedOccupied || !morador) return null;
    return (
      minhasReservas.find(
        (r) =>
          r.id === inspectedOccupied.id &&
          r.status === "PENDENTE_PAGAMENTO" &&
          Date.parse(r.expires_at) > syncedNowMs
      ) ?? null
    );
  }, [inspectedOccupied, morador, minhasReservas, syncedNowMs]);

  return (
    <div className="min-h-dvh flex flex-col bg-[#F8F7F4]">
      {/* Topbar oficial em Obsidian (#0C0C0D) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0C0C0D] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <MilanoLogo
              variant="full-light"
              className="hidden sm:block h-9 w-auto shrink-0"
            />
            <MilanoLogo
              variant="icon"
              className="sm:hidden h-8 w-auto shrink-0"
            />
            <div className="sm:border-l sm:border-white/15 sm:pl-3 min-w-0">
              <p className="font-display text-sm sm:text-base font-bold leading-tight truncate">
                Agenda de Áreas Comuns
              </p>
              <p className="text-[11px] text-[#CCB285] truncate">
                Salão de Festas &amp; Quiosques
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {morador ? (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 rounded-xl border border-[#CCB285]/40 bg-[#1E1E22] px-3 py-2 text-xs">
                  <Building2 className="h-4 w-4 text-[#CCB285] shrink-0" />
                  <span className="font-semibold text-white tabular-nums max-w-[140px] sm:max-w-none truncate">
                    {morador.identificacao_publica}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sair"
                  aria-label="Sair da sessão"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#1E1E22] text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPendingDateAfterCpf(null);
                  setCpfModalOpen(true);
                }}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#CCB285] px-4 text-xs sm:text-sm font-bold text-[#0C0C0D] hover:bg-[#d8c199] transition-colors"
              >
                <UserCheck className="h-4 w-4" />
                <span>Entrar com CPF</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        {feedbackBanner && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-2xl border border-[#15803D]/30 bg-[#F0FDF4] p-4 text-sm font-medium text-[#166534]"
          >
            <span>{feedbackBanner}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-xs font-bold underline shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-[#FEF2F2] p-4 text-sm font-medium text-[#B91C1C]"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-bold underline shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Seletor de Espaços (Segmented Control) */}
        <section aria-label="Escolha o espaço">
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#E7E2D8] bg-[#EFECE4] p-1.5">
            {agenda.espacos.map((esp) => {
              const active = espacoAtivo?.id === esp.id;
              return (
                <button
                  key={esp.id}
                  type="button"
                  onClick={() => {
                    setSelectedEspacoId(esp.id);
                    setSelectedOccupiedDate(null);
                  }}
                  className={`min-h-[48px] rounded-xl px-2 py-2 text-center transition-all ${
                    active
                      ? "bg-[#0C0C0D] text-white shadow-xs"
                      : "text-[#52525B] hover:text-[#0C0C0D]"
                  }`}
                >
                  <span className="block font-display text-xs sm:text-sm font-bold leading-tight">
                    {esp.nome}
                  </span>
                  <span
                    className={`mt-0.5 block text-[10px] tabular-nums ${
                      active ? "text-[#CCB285]" : "text-[#71717A]"
                    }`}
                  >
                    {esp.capacidade_maxima
                      ? `Máx. ${esp.capacidade_maxima} pessoas`
                      : esp.slug === "quiosque-1"
                        ? "Quadra esportiva"
                        : "Quadra de areia"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Card de Informações e Tabela de Preços do Espaço */}
        {espacoAtivo && (
          <section className="rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-xs flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold text-[#0C0C0D]">
                  {espacoAtivo.nome}
                </h1>
                {espacoAtivo.capacidade_maxima && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FAF7F1] border border-[#E5D5B8] px-2.5 py-0.5 text-xs font-semibold text-[#7D6335]">
                    <Users className="h-3.5 w-3.5" />
                    Máx. {espacoAtivo.capacidade_maxima} pessoas
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#52525B] flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-[#9A7D4A] shrink-0" />
                <span>{espacoAtivo.descricao_localizacao}</span>
              </p>
              <p className="text-[11px] text-[#71717A]">
                Pagamento em dinheiro ao síndico (48h) • Limite de 1 reserva por local no mês.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center shrink-0">
              <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF7F1] px-2.5 py-2">
                <span className="block text-[10px] font-medium text-[#52525B]">
                  Seg a Qui
                </span>
                <span className="font-display text-sm font-bold text-[#0C0C0D] tabular-nums">
                  {formatBrlShort(espacoAtivo.preco_seg_qui_centavos)}
                </span>
              </div>
              <div className="rounded-xl border border-[#E7E2D8] bg-[#FAF7F1] px-2.5 py-2">
                <span className="block text-[10px] font-medium text-[#52525B]">
                  Sexta-feira
                </span>
                <span className="font-display text-sm font-bold text-[#0C0C0D] tabular-nums">
                  {formatBrlShort(espacoAtivo.preco_sex_centavos)}
                </span>
              </div>
              <div className="rounded-xl border border-[#E5D5B8] bg-[#F3EBDC] px-2.5 py-2">
                <span className="block text-[10px] font-semibold text-[#7D6335]">
                  Sáb/Dom/Fer.
                </span>
                <span className="font-display text-sm font-bold text-[#0C0C0D] tabular-nums">
                  {formatBrlShort(espacoAtivo.preco_fds_feriado_centavos)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Navegação Mensal */}
        <section className="flex items-center justify-between rounded-2xl border border-[#E7E2D8] bg-white px-3 py-2.5 shadow-xs">
          <button
            type="button"
            onClick={() => handleMonthStep(-1)}
            disabled={!canGoPrev || loadingMonth}
            aria-label="Mês anterior"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E7E2D8] text-[#0C0C0D] hover:bg-[#FAF7F1] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-[#9A7D4A]" />
            <span className="font-display text-base sm:text-lg font-bold text-[#0C0C0D]">
              {formatMonthYearPtBr(agenda.year, agenda.month)}
            </span>
            {loadingMonth && (
              <span className="text-xs text-[#7D6335] font-medium">
                Atualizando...
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleMonthStep(1)}
            disabled={!canGoNext || loadingMonth}
            aria-label="Próximo mês"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E7E2D8] text-[#0C0C0D] hover:bg-[#FAF7F1] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </section>

        {/* Contador Regressivo quando o mês ainda não abriu (antes do dia 25 às 20:00) */}
        {!agenda.monthUnlocked && (
          <CountdownBanner
            year={agenda.year}
            month={agenda.month}
            openingAt={agenda.openingAt}
            serverOffsetMs={serverOffsetMs}
            onUnlocked={() => void fetchMonth(agenda.year, agenda.month)}
          />
        )}

        {/* Aviso de cota mensal atingida para o espaço selecionado */}
        {myActiveInSpaceMonth && espacoAtivo && (
          <div className="rounded-2xl border border-[#E5D5B8] bg-[#FAF7F1] p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5 text-xs sm:text-sm text-[#18181B]">
              <p className="font-display font-bold text-[#0C0C0D]">
                Limite mensal atingido para {espacoAtivo.nome}
              </p>
              <p className="text-xs text-[#52525B]">
                Você já possui reserva ativa em{" "}
                <strong className="text-[#0C0C0D] tabular-nums">
                  {formatDateShortPtBr(myActiveInSpaceMonth.data_reserva)}
                </strong>{" "}
                (limite de 1 reserva por local no mês).
                {myActiveInSpaceMonth.status === "PENDENTE_PAGAMENTO"
                  ? " Para escolher outra data, exclua esta reserva pendente."
                  : ""}
              </p>
            </div>

            {myActiveInSpaceMonth.status === "PENDENTE_PAGAMENTO" &&
              (confirmBannerCancel ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={cancelingId === myActiveInSpaceMonth.id}
                    onClick={() =>
                      void handleCancelOwnReservation(myActiveInSpaceMonth)
                    }
                    className="inline-flex h-10 items-center rounded-xl bg-[#B91C1C] px-3.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    {cancelingId === myActiveInSpaceMonth.id
                      ? "Excluindo..."
                      : "Confirmar exclusão"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBannerCancel(false)}
                    className="inline-flex h-10 items-center rounded-xl border border-[#E7E2D8] bg-white px-3 text-xs font-semibold text-[#52525B]"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmBannerCancel(true)}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-100 shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir minha reserva</span>
                </button>
              ))}
          </div>
        )}

        {/* Grade do Calendário */}
        {espacoAtivo && (
          <CalendarGrid
            year={agenda.year}
            month={agenda.month}
            todayLocal={agenda.todayLocal}
            monthUnlocked={agenda.monthUnlocked}
            syncedNowMs={syncedNowMs}
            espaco={espacoAtivo}
            feriados={agenda.feriados}
            reservas={agenda.reservas}
            selectedOccupiedDate={selectedOccupiedDate}
            onSelectFreeDate={handleSelectFreeDate}
            onSelectOccupiedDate={(ymd) =>
              setSelectedOccupiedDate((prev) => (prev === ymd ? null : ymd))
            }
          />
        )}

        {/* Detalhe ao tocar em um dia já ocupado (ótimo para leitura mobile) */}
        {inspectedOccupied && (
          <div className="rounded-2xl border border-[#E5D5B8] bg-[#FAF7F1] p-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7D6335]">
                Detalhe da Data Ocupada
              </p>
              <p className="font-display text-sm sm:text-base font-bold text-[#0C0C0D]">
                {formatDateLongPtBr(inspectedOccupied.data_reserva)}
              </p>
              <p className="text-sm font-semibold text-[#18181B] tabular-nums">
                Unidade:{" "}
                <span className="text-[#0C0C0D]">
                  {inspectedOccupied.identificacao_publica}
                </span>
              </p>
              <p className="text-xs text-[#52525B]">
                Status:{" "}
                <strong>
                  {inspectedOccupied.status_efetivo === "CONFIRMADO"
                    ? "Confirmado (pago em espécie)"
                    : `Aguardando Pagamento (prazo até ${formatDateTimeShortPtBr(
                        inspectedOccupied.expires_at
                      )})`}
                </strong>
              </p>
              {inspectedOwnPending && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={cancelingId === inspectedOwnPending.id}
                    onClick={() =>
                      void handleCancelOwnReservation(inspectedOwnPending)
                    }
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-[#FEF2F2] px-3.5 text-xs font-semibold text-[#B91C1C] hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>
                      {cancelingId === inspectedOwnPending.id
                        ? "Excluindo..."
                        : "Excluir esta reserva"}
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedOccupiedDate(null)}
              className="text-xs font-semibold text-[#7D6335] underline shrink-0"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Lista legível de Feriados e Datas Reservadas do Mês */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-xs space-y-2.5">
            <h2 className="font-display text-sm font-bold text-[#0C0C0D] flex items-center gap-2">
              <Info className="h-4 w-4 text-[#9A7D4A]" />
              <span>
                Reservas de {espacoAtivo?.nome} no mês ({occupiedListForSpace.length})
              </span>
            </h2>
            {occupiedListForSpace.length === 0 ? (
              <p className="text-xs text-[#52525B]">
                Nenhuma data ocupada neste mês até o momento.
              </p>
            ) : (
              <ul className="divide-y divide-[#E7E2D8]">
                {occupiedListForSpace.map((r) => (
                  <li
                    key={r.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#0C0C0D] tabular-nums">
                        {formatDateShortPtBr(r.data_reserva)}
                      </span>{" "}
                      <span className="text-[#52525B] tabular-nums">
                        — {r.identificacao_publica}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        r.status_efetivo === "CONFIRMADO"
                          ? "bg-[#F0FDF4] text-[#166534]"
                          : "bg-[#FFFBEB] text-[#92400E]"
                      }`}
                    >
                      {r.status_efetivo === "CONFIRMADO"
                        ? "Confirmado"
                        : "Aguardando Pgto"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-xs space-y-2.5">
            <h2 className="font-display text-sm font-bold text-[#0C0C0D] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#9A7D4A]" />
              <span>Feriados no mês ({holidaysInMonth.length})</span>
            </h2>
            {holidaysInMonth.length === 0 ? (
              <p className="text-xs text-[#52525B]">
                Nenhum feriado cadastrado neste mês.
              </p>
            ) : (
              <ul className="divide-y divide-[#E7E2D8]">
                {holidaysInMonth.map((f) => (
                  <li
                    key={f.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#0C0C0D] tabular-nums">
                        {formatDateShortPtBr(f.data)}
                      </span>{" "}
                      <span className="text-[#52525B]">— {f.nome}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#FAF7F1] border border-[#E5D5B8] px-2 py-0.5 text-[10px] font-semibold text-[#7D6335]">
                      {f.tipo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Minhas Reservas (somente quando identificado pelo CPF) */}
        {morador && (
          <MyReservationsPanel
            reservas={minhasReservas}
            syncedNowMs={syncedNowMs}
            loading={loadingMinhas}
            cancelingId={cancelingId}
            onCancelReservation={handleCancelOwnReservation}
          />
        )}
      </main>

      {/* Rodapé com informações institucionais e link discreto do Síndico */}
      <footer className="border-t border-[#E7E2D8] bg-white py-5 px-4 mt-6">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#52525B]">
          <p className="text-center sm:text-left">
            Milano Condomínio Club • Abertura mensal todo dia 25 às 20:00 • LGPD: exibimos apenas Bloco e Apartamento.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E2D8] px-3 py-1.5 font-semibold text-[#0C0C0D] hover:bg-[#FAF7F1] shrink-0 transition-colors"
          >
            <Shield className="h-3.5 w-3.5 text-[#7D6335]" />
            <span>Painel do Síndico</span>
          </Link>
        </div>
      </footer>

      <CpfModal
        key={cpfModalOpen ? "cpf-open" : "cpf-closed"}
        open={cpfModalOpen}
        onClose={() => {
          setCpfModalOpen(false);
          setPendingDateAfterCpf(null);
        }}
        onSuccess={handleCpfSuccess}
      />

      <BookingModal
        key={
          bookingDate && espacoAtivo
            ? `booking-${espacoAtivo.id}-${bookingDate}`
            : "booking-closed"
        }
        open={Boolean(bookingDate && espacoAtivo && morador)}
        espaco={espacoAtivo}
        dateYmd={bookingDate}
        valorCentavos={bookingPriceInfo?.valorCentavos ?? 0}
        regraTarifa={bookingPriceInfo?.regraTarifa ?? "SEG_A_QUI"}
        feriadoNome={bookingPriceInfo?.feriadoNome ?? null}
        morador={morador}
        prazoHoras={agenda.config.prazo_pagamento_horas}
        onClose={() => setBookingDate(null)}
        onBooked={handleBooked}
        onConflictRefresh={() => void fetchMonth(agenda.year, agenda.month)}
      />
    </div>
  );
}
