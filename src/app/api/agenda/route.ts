import { NextResponse } from "next/server";
import { getAgendaMesData } from "@/lib/agenda/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  const year = yearParam ? Number(yearParam) : undefined;
  const month = monthParam ? Number(monthParam) : undefined;

  if (
    (year !== undefined && (!Number.isInteger(year) || year < 2025 || year > 2100)) ||
    (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12))
  ) {
    return NextResponse.json(
      { ok: false, message: "Parâmetros de mês/ano inválidos." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const data = await getAgendaMesData(year, month);
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "Não foi possível carregar a agenda do mês." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
