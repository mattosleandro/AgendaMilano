"use client";

import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { formatDateShortPtBr } from "@/lib/agenda/pricing";
import type { FeriadoPublico, FeriadoTipo } from "@/lib/agenda/types";

interface AdminHolidaysClientProps {
  initialYear: number;
  initialFeriados: FeriadoPublico[];
}

export function AdminHolidaysClient({
  initialYear,
  initialFeriados,
}: AdminHolidaysClientProps) {
  const [year, setYear] = useState(initialYear);
  const [feriados, setFeriados] = useState<FeriadoPublico[]>(initialFeriados);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Novo feriado local
  const [newData, setNewData] = useState(`${initialYear}-`);
  const [newNome, setNewNome] = useState("");
  const [newTipo, setNewTipo] = useState<FeriadoTipo>("MUNICIPAL");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadYear = async (targetYear: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feriados?year=${targetYear}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        feriados?: FeriadoPublico[];
      };
      if (res.ok && data.ok && data.feriados) {
        setFeriados(data.feriados);
        setYear(targetYear);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSyncBrasilApi = async () => {
    setSyncing(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/feriados/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        fetched?: number;
        upserted?: number;
        skippedManual?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Falha ao sincronizar com a BrasilAPI.");
        return;
      }
      setFeedback(
        `Feriados de ${year} sincronizados (BrasilAPI + oficiais de Dourados/MS): ${data.upserted} atualizados.`
      );
      await loadYear(year);
    } catch {
      setError("Erro de rede ao consultar BrasilAPI.");
    } finally {
      setSyncing(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const res = await fetch("/api/admin/feriados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: newData, nome: newNome, tipo: newTipo }),
    });
    const payload = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !payload.ok) {
      setError(payload.message || "Erro ao cadastrar feriado.");
      return;
    }

    const addedYear = Number(newData.slice(0, 4)) || year;
    setNewNome("");
    setFeedback("Feriado local salvo com sucesso. Tarifas atualizadas.");
    await loadYear(addedYear);
  };

  const handleToggleActive = async (item: FeriadoPublico) => {
    setError(null);
    const res = await fetch(`/api/admin/feriados/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !item.ativo }),
    });
    if (res.ok) {
      await loadYear(year);
    }
  };

  const handleDelete = async (item: FeriadoPublico) => {
    setError(null);
    const res = await fetch(`/api/admin/feriados/${item.id}`, {
      method: "DELETE",
    });
    const payload = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !payload.ok) {
      setError(payload.message || "Erro ao remover feriado.");
      return;
    }
    await loadYear(year);
  };

  return (
    <div className="space-y-5">
      {/* Barra de ano e sincronização BrasilAPI */}
      <div className="rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="holiday-year" className="text-sm font-semibold text-[#0C0C0D]">
            Ano:
          </label>
          <select
            id="holiday-year"
            value={year}
            onChange={(e) => void loadYear(Number(e.target.value))}
            className="h-10 rounded-xl border border-[#D4CFC4] bg-white px-3 text-sm font-semibold text-[#0C0C0D] tabular-nums"
          >
            {[2026, 2027, 2028, 2029].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleSyncBrasilApi}
          disabled={syncing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0C0C0D] px-4 text-xs sm:text-sm font-semibold text-white hover:bg-[#1E1E22] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-[#CCB285] ${syncing ? "animate-spin" : ""}`} />
          <span>
            {syncing
              ? "Sincronizando..."
              : `Sincronizar Feriados ${year} (BrasilAPI + Dourados/MS)`}
          </span>
        </button>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-[#15803D]/30 bg-[#F0FDF4] p-3 text-xs sm:text-sm font-medium text-[#166534]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs sm:text-sm font-medium text-[#B91C1C]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Formulário para feriado estadual / municipal / condomínio */}
      <form
        onSubmit={handleAddHoliday}
        className="rounded-2xl border border-[#E7E2D8] bg-white p-4 sm:p-5 shadow-xs space-y-3"
      >
        <h2 className="font-display text-base font-bold text-[#0C0C0D]">
          Adicionar Feriado Estadual / Municipal / Condomínio
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="f-data" className="block text-xs font-semibold text-[#52525B] mb-1">
              Data
            </label>
            <input
              id="f-data"
              type="date"
              required
              value={newData}
              onChange={(e) => setNewData(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D4CFC4] px-3 text-sm tabular-nums"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="f-nome" className="block text-xs font-semibold text-[#52525B] mb-1">
              Nome do Feriado
            </label>
            <input
              id="f-nome"
              type="text"
              required
              placeholder="Ex: Aniversário de Dourados"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              className="w-full h-11 rounded-xl border border-[#D4CFC4] px-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="f-tipo" className="block text-xs font-semibold text-[#52525B] mb-1">
              Âmbito
            </label>
            <select
              id="f-tipo"
              value={newTipo}
              onChange={(e) => setNewTipo(e.target.value as FeriadoTipo)}
              className="w-full h-11 rounded-xl border border-[#D4CFC4] bg-white px-3 text-sm"
            >
              <option value="MUNICIPAL">Municipal (Dourados - MS)</option>
              <option value="ESTADUAL">Estadual (Mato Grosso do Sul)</option>
              <option value="CONDOMINIO">Condomínio</option>
              <option value="NACIONAL">Nacional</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#CCB285] px-5 text-sm font-bold text-[#0C0C0D] hover:bg-[#d8c199]"
          >
            <Plus className="h-4 w-4" />
            <span>Salvar Feriado</span>
          </button>
        </div>
      </form>

      {/* Tabela de Feriados */}
      <div className="rounded-2xl border border-[#E7E2D8] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#FAF7F1] border-b border-[#E7E2D8] text-[11px] uppercase tracking-wider text-[#52525B]">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Feriado</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E2D8]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#52525B]">
                    Carregando feriados...
                  </td>
                </tr>
              ) : feriados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#52525B]">
                    Nenhum feriado cadastrado para {year}.
                  </td>
                </tr>
              ) : (
                feriados.map((f) => (
                  <tr key={f.id} className={!f.ativo ? "opacity-55 bg-zinc-50" : ""}>
                    <td className="px-4 py-3 font-bold text-[#0C0C0D] tabular-nums whitespace-nowrap">
                      {formatDateShortPtBr(f.data)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#18181B]">
                      {f.nome}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#FAF7F1] border border-[#E5D5B8] px-2.5 py-0.5 text-[11px] font-semibold text-[#7D6335]">
                        {f.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#52525B]">{f.origem}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(f)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          f.ativo
                            ? "bg-[#F0FDF4] text-[#166534]"
                            : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {f.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.origem === "MANUAL" ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(f)}
                          title="Excluir feriado manual"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-[#FEF2F2] px-2.5 py-1 text-xs font-semibold text-[#B91C1C] hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Excluir</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#71717A]">BrasilAPI</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
