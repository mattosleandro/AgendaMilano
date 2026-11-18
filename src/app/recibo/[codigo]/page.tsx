import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import React from "react";
import { ReceiptDocument } from "@/components/ReceiptDocument";
import type { ReciboVerificacaoResponse } from "@/lib/agenda/types";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function ReciboPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const cleanCode = (codigo || "").trim().toUpperCase();

  let verified: ReciboVerificacaoResponse | null = null;
  if (/^MIL-\d{4}-[A-Z0-9]{6,}$/.test(cleanCode)) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.rpc("agenda_verificar_recibo", {
      p_codigo: cleanCode,
    });
    if (data && (data as { ok?: boolean }).ok) {
      verified = data as ReciboVerificacaoResponse;
    }
  }

  if (!verified) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8F7F4] p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#E7E2D8] bg-white p-6 text-center space-y-4 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF2F2] text-[#B91C1C]">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-lg font-bold text-[#0C0C0D]">
              Recibo não encontrado
            </h1>
            <p className="text-sm text-[#52525B]">
              O código informado não corresponde a nenhum recibo digital válido no
              sistema.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0C0C0D] px-5 text-sm font-semibold text-white hover:bg-[#1E1E22]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Ir para Agenda</span>
          </Link>
        </div>
      </div>
    );
  }

  return <ReceiptDocument data={verified} />;
}
