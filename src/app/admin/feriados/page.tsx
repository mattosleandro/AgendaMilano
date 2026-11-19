import { redirect } from "next/navigation";
import React from "react";
import { AdminHolidaysClient } from "@/components/admin/AdminHolidaysClient";
import { AdminNav } from "@/components/admin/AdminNav";
import { ensureYearsHolidaysSynced } from "@/lib/agenda/holidays";
import {
  getAdminFeriadosInitialData,
  getAdminSessionFromCookies,
} from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export default async function AdminFeriadosPage() {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    redirect("/admin/login");
  }

  const initial = await getAdminFeriadosInitialData();
  await ensureYearsHolidaysSynced([initial.year]);
  const refreshed = await getAdminFeriadosInitialData();

  return (
    <div className="min-h-dvh bg-[#F8F7F4]">
      <AdminNav nomeExibicao={admin.nome_exibicao} />
      <main className="mx-auto max-w-6xl px-3 sm:px-4 py-6 space-y-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0C0C0D]">
            Feriados Nacionais, Estaduais (MS) e Municipais (Dourados - MS)
          </h1>
          <p className="text-xs sm:text-sm text-[#52525B]">
            Feriados ativos aplicam automaticamente a tarifa de feriado (R$ 220 Salão / R$ 90 Quiosques).
          </p>
        </div>

        <AdminHolidaysClient
          initialYear={refreshed.year}
          initialFeriados={refreshed.feriados}
        />
      </main>
    </div>
  );
}
