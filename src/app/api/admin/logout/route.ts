import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { ADMIN_COOKIE_NAME } from "@/lib/security/session";

export async function POST() {
  const env = getServerEnv();
  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
