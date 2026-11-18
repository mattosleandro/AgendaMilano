import { NextResponse } from "next/server";
import {
  getAdminReservas,
  getAdminSessionFromCookies,
} from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json(
      { ok: false, message: "Não autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "ALL";
  const espacoId = searchParams.get("espacoId") ?? "ALL";
  const yearMonth = searchParams.get("yearMonth") ?? "";
  const search = searchParams.get("search") ?? "";

  try {
    const reservas = await getAdminReservas({
      status,
      espacoId,
      yearMonth,
      search,
    });
    return NextResponse.json(
      { ok: true, reservas, serverNow: new Date().toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Erro ao consultar reservas." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
