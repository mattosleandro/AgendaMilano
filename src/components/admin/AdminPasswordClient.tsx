"use client";

import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import React, { useState } from "react";

export function AdminPasswordClient() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (novaSenha.length < 8) {
      setError("A nova senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message || "Não foi possível alterar a senha.");
        return;
      }
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      setSuccess("Senha atualizada com sucesso!");
    } catch {
      setError("Falha de conexão ao atualizar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-md rounded-2xl border border-[#E7E2D8] bg-white p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div>
        <label htmlFor="s-atual" className="block text-sm font-semibold text-[#18181B] mb-1">
          Senha atual
        </label>
        <input
          id="s-atual"
          type="password"
          required
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          className="w-full h-11 rounded-xl border border-[#D4CFC4] px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="s-nova" className="block text-sm font-semibold text-[#18181B] mb-1">
          Nova senha (mínimo 8 caracteres)
        </label>
        <input
          id="s-nova"
          type="password"
          required
          minLength={8}
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          className="w-full h-11 rounded-xl border border-[#D4CFC4] px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="s-conf" className="block text-sm font-semibold text-[#18181B] mb-1">
          Confirmar nova senha
        </label>
        <input
          id="s-conf"
          type="password"
          required
          minLength={8}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="w-full h-11 rounded-xl border border-[#D4CFC4] px-3 text-sm"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-[#FEF2F2] p-3 text-xs font-medium text-[#B91C1C]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-[#15803D]/30 bg-[#F0FDF4] p-3 text-xs font-medium text-[#166534]">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0C0C0D] text-sm font-semibold text-white hover:bg-[#1E1E22] disabled:opacity-50"
      >
        <KeyRound className="h-4 w-4 text-[#CCB285]" />
        <span>{loading ? "Salvando..." : "Salvar Nova Senha"}</span>
      </button>
    </form>
  );
}
