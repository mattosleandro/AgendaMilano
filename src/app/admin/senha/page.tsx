import { redirect } from "next/navigation";
import React from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminPasswordClient } from "@/components/admin/AdminPasswordClient";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export default async function AdminSenhaPage() {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-dvh bg-[#F8F7F4]">
      <AdminNav nomeExibicao={admin.nome_exibicao} />
      <main className="mx-auto max-w-6xl px-3 sm:px-4 py-6 space-y-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#0C0C0D]">
            Alterar Senha de Acesso
          </h1>
          <p className="text-xs sm:text-sm text-[#52525B]">
            Usuário atual: <strong>{admin.username}</strong>
          </p>
        </div>

        <AdminPasswordClient />
      </main>
    </div>
  );
}
