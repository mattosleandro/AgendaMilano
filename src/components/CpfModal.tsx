"use client";

import { AlertCircle, ShieldCheck, X } from "lucide-react";
import React, { useState } from "react";
import { formatCpfInput, isValidCpf } from "@/lib/agenda/cpf";
import type { MoradorPublicSession } from "@/lib/agenda/types";

interface CpfModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (morador: MoradorPublicSession) => void;
}

export function CpfModal({ open, onClose, onSuccess }: CpfModalProps) {
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidCpf(cpf)) {
      setError("CPF inválido. Digite os 11 dígitos corretamente.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/cpf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        morador?: MoradorPublicSession;
      };

      if (!res.ok || !data.ok || !data.morador) {
        setError(
          data.message || "CPF não localizado no cadastro de moradores."
        );
        return;
      }

      setCpf("");
      onSuccess(data.morador);
    } catch {
      setError("Falha de conexão ao validar CPF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cpf-modal-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E7E2D8] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E7E2D8] bg-[#FAF7F1] px-5 py-4">
          <div>
            <h2
              id="cpf-modal-title"
              className="font-display text-lg font-bold text-[#0C0C0D]"
            >
              Identificação do Morador
            </h2>
            <p className="text-xs text-[#52525B]">
              Milano Condomínio Club — Acesso por CPF
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de identificação"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-[#52525B] hover:bg-[#F3EBDC] hover:text-[#0C0C0D] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-xl border border-[#E5D5B8] bg-[#FAF7F1] p-3.5 text-xs text-[#52525B] flex gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[#7D6335] shrink-0 mt-0.5" />
            <p>
              Seu CPF serve apenas para confirmar sua unidade no cadastro oficial.
              Na agenda pública exibimos{" "}
              <strong className="text-[#0C0C0D]">
                somente Bloco e Apartamento
              </strong>{" "}
              (em conformidade com a LGPD).
            </p>
          </div>

          <div>
            <label
              htmlFor="cpf-input"
              className="block text-sm font-semibold text-[#18181B] mb-1.5"
            >
              CPF do titular cadastrado
            </label>
            <input
              id="cpf-input"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="000.000.000-00"
              maxLength={14}
              value={cpf}
              onChange={(e) => {
                setError(null);
                setCpf(formatCpfInput(e.target.value));
              }}
              className="w-full h-12 rounded-xl border border-[#D4CFC4] bg-white px-4 text-base font-medium text-[#0C0C0D] tabular-nums placeholder:text-zinc-400 focus:border-[#7D6335] focus:outline-none focus:ring-2 focus:ring-[#CCB285]/40"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs font-medium text-[#B91C1C]"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-xl border border-[#E7E2D8] bg-white text-sm font-semibold text-[#52525B] hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || cpf.length < 14}
              className="h-12 flex-[1.5] rounded-xl bg-[#0C0C0D] text-sm font-semibold text-white hover:bg-[#1E1E22] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Validando..." : "Confirmar CPF"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
