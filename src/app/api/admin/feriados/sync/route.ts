import { NextResponse } from "next/server";
import { syncYearFromBrasilApi } from "@/lib/agenda/holidays";
import { getAdminSessionFromCookies } from "@/lib/agenda/queries";

export async function POST(request: Request) {
  const admin = await getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  let body: { year?: unknown };
  try {
    body = (await request.json()) as { year?: unknown };
  } catch {
    body = {};
  }

  const currentYear = new Date().getUTCFullYear();
  const targetYear =
    typeof body.year === "number" &&
    Number.isInteger(body.year) &&
    body.year >= 2024 &&
    body.year <= 2100
      ? body.year
      : currentYear;

  const result = await syncYearFromBrasilApi(targetYear);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
