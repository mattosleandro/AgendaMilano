import crypto from "node:crypto";
import type {
  AdminCookieSession,
  MoradorCookieSession,
  MoradorPublicSession,
} from "../agenda/types";

export const MORADOR_COOKIE_NAME = "milano_agenda_morador";
export const ADMIN_COOKIE_NAME = "milano_agenda_admin";

const MORADOR_TTL_SECONDS = 60 * 60 * 12; // 12h
const ADMIN_TTL_SECONDS = 60 * 60 * 8; // 8h

export function signPayload<T extends object>(payload: T, secret: string): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedPayload<T extends { exp: number }>(
  token: string | undefined | null,
  secret: string,
  nowMs: number = Date.now()
): T | null {
  if (!token || typeof token !== "string") return null;
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0) return null;

  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!body || !sig || sig.includes(".")) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  const sigBuf = Buffer.from(sig, "utf8");
  const expBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as T;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Math.floor(nowMs / 1000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createMoradorSessionToken(
  sessionData: Omit<MoradorCookieSession, "exp">,
  secret: string,
  nowMs: number = Date.now()
): string {
  const payload: MoradorCookieSession = {
    ...sessionData,
    exp: Math.floor(nowMs / 1000) + MORADOR_TTL_SECONDS,
  };
  return signPayload(payload, secret);
}

export function createAdminSessionToken(
  adminData: Omit<AdminCookieSession, "exp">,
  secret: string,
  nowMs: number = Date.now()
): string {
  const payload: AdminCookieSession = {
    ...adminData,
    exp: Math.floor(nowMs / 1000) + ADMIN_TTL_SECONDS,
  };
  return signPayload(payload, secret);
}

export function sanitizeMoradorForClient(
  session: MoradorCookieSession | null
): MoradorPublicSession | null {
  if (!session) return null;
  return {
    identificacao_publica: session.identificacao_publica,
    quantidade_unidades: session.quantidade_unidades,
    bloco: session.bloco,
    apartamento: session.apartamento,
  };
}

export function getSessionCookieOptions(isProd: boolean, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export { MORADOR_TTL_SECONDS, ADMIN_TTL_SECONDS };
