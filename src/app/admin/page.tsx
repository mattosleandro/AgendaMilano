import { redirect } from "next/navigation";
import React from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminReservationsClient } from "@/components/admin/AdminReservationsClient";
import {
  getAdminReservas,
  getAdminSessionFromCookies,
  getEspacosAtivos,
} from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    redirect("/admin/login");
  }

  const [initialReservas, espacos] = await Promise.all([
    getAdminReservas(),
    getEspacosAtivos(),
  ]);

  return (
    <div className="min-h-dvh bg-[#F8F7F4]">
      <AdminNav nomeExibicao={admin.nome_exibicao} />
      <main className="mx-auto max-w-6xl px-3 sm:px-4 py-6 space-y-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0C0C0D]">
            Gestão de Reservas e Pagamentos em Espécie
          </h1>
          <p className="text-xs sm:text-sm text-[#52525B]">
            Confirme pagamentos recebidos em dinheiro vivo para emitir o Recibo Digital Auditável.
          </p>
        </div>

        <AdminReservationsClient
          initialReservas={initialReservas}
          espacos={espacos}
          initialServerNow={new Date().toISOString()}
        />
      </main>
    </div>
  );
}
