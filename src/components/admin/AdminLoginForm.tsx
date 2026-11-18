"use client";

import { AlertCircle, ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { MilanoLogo } from "../MilanoLogo";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message || "Credenciais inválidas.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Falha de conexão ao autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F8F7F4] p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-2xl border border-[#E7E2D8] bg-white shadow-sm overflow-hidden">
          <div className="bg-[#0C0C0D] px-6 py-6 text-center space-y-2">
            <MilanoLogo variant="full-light" className="mx-auto h-10 w-auto" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[#CCB285]">
              Acesso Restrito — Painel do Síndico
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="admin-user"
                className="block text-sm font-semibold text-[#18181B] mb-1.5"
              >
                Usuário
              </label>
              <input
                id="admin-user"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sindico"
                className="w-full h-12 rounded-xl border border-[#D4CFC4] px-4 text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none focus:ring-2 focus:ring-[#CCB285]/40"
              />
            </div>

            <div>
              <label
                htmlFor="admin-pass"
                className="block text-sm font-semibold text-[#18181B] mb-1.5"
              >
                Senha
              </label>
              <input
                id="admin-pass"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-12 rounded-xl border border-[#D4CFC4] px-4 text-sm text-[#0C0C0D] focus:border-[#7D6335] focus:outline-none focus:ring-2 focus:ring-[#CCB285]/40"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0C0C0D] text-sm font-semibold text-white hover:bg-[#1E1E22] disabled:opacity-50 transition-colors"
            >
              <Lock className="h-4 w-4 text-[#CCB285]" />
              <span>{loading ? "Entrando..." : "Entrar no Painel"}</span>
            </button>
          </form>
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52525B] hover:text-[#0C0C0D]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Voltar para Agenda Pública</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
