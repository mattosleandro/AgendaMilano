"use client";

import {
  CalendarCheck,
  CalendarPlus,
  ExternalLink,
  KeyRound,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { MilanoLogo } from "../MilanoLogo";

interface AdminNavProps {
  nomeExibicao: string;
}

export function AdminNav({ nomeExibicao }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const navItems = [
    { href: "/admin", label: "Reservas", icon: CalendarCheck },
    { href: "/admin/feriados", label: "Feriados", icon: CalendarPlus },
    { href: "/admin/senha", label: "Alterar Senha", icon: KeyRound },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0C0C0D] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-3">
            <MilanoLogo variant="full-light" className="hidden sm:block h-8 w-auto" />
            <MilanoLogo variant="icon" className="sm:hidden h-8 w-auto" />
          </Link>
          <div className="border-l border-white/15 pl-3">
            <p className="font-display text-sm font-bold leading-tight">
              Painel do Síndico
            </p>
            <p className="text-[11px] text-[#CCB285]">{nomeExibicao}</p>
          </div>
        </div>

        <nav
          aria-label="Navegação administrativa"
          className="flex flex-wrap items-center gap-1.5"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-[#CCB285] text-[#0C0C0D]"
                    : "bg-[#1E1E22] text-zinc-200 hover:bg-white/10"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <Link
            href="/"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#CCB285]" />
            <span className="hidden md:inline">Agenda Pública</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-semibold text-zinc-300 hover:bg-red-500/20 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
