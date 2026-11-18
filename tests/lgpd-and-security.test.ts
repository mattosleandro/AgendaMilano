import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRateLimit } from "../src/lib/security/rate-limit.ts";
import {
  createAdminSessionToken,
  createMoradorSessionToken,
  sanitizeMoradorForClient,
  verifySignedPayload,
} from "../src/lib/security/session.ts";
import type { AdminCookieSession, MoradorCookieSession } from "../src/lib/agenda/types.ts";

const TEST_SECRET = "segredo-super-seguro-de-teste-minimo-32-caracteres";

describe("Segurança de Sessão, LGPD e Rate Limit", () => {
  it("assina e valida token do morador e rejeita adulteração ou expiração", () => {
    const now = Date.UTC(2026, 10, 18, 20, 0, 0);
    const token = createMoradorSessionToken(
      {
        unidade_principal_id: "00000000-0000-0000-0000-000000000001",
        bloco: 20,
        apartamento: 402,
        quantidade_unidades: 2,
        identificacao_publica: "Bloco 20 - Apto 402 / Bloco 28 - Apto 404",
        titular_cpf_hash: "a".repeat(64),
        unidades: [
          {
            unidade_id: "00000000-0000-0000-0000-000000000001",
            bloco: 20,
            apartamento: 402,
            label: "Bloco 20 - Apto 402",
          },
          {
            unidade_id: "00000000-0000-0000-0000-000000000002",
            bloco: 28,
            apartamento: 404,
            label: "Bloco 28 - Apto 404",
          },
        ],
      },
      TEST_SECRET,
      now
    );

    const verified = verifySignedPayload<MoradorCookieSession>(token, TEST_SECRET, now + 1000);
    assert.ok(verified);
    assert.equal(verified.identificacao_publica, "Bloco 20 - Apto 402 / Bloco 28 - Apto 404");

    // Adulteração do corpo falha
    const tampered = `X${token.slice(1)}`;
    assert.equal(verifySignedPayload<MoradorCookieSession>(tampered, TEST_SECRET, now + 1000), null);

    // Segredo errado falha
    assert.equal(verifySignedPayload<MoradorCookieSession>(token, "outro-segredo-errado-32-caracteres", now + 1000), null);

    // Expiração falha
    assert.equal(
      verifySignedPayload<MoradorCookieSession>(token, TEST_SECRET, now + 13 * 3600 * 1000),
      null
    );

    // Sanitização remove titular_cpf_hash e unidade_principal_id antes de enviar ao cliente
    const clientSafe = sanitizeMoradorForClient(verified);
    assert.deepEqual(clientSafe, {
      identificacao_publica: "Bloco 20 - Apto 402 / Bloco 28 - Apto 404",
      quantidade_unidades: 2,
      bloco: 20,
      apartamento: 402,
    });
    assert.equal("titular_cpf_hash" in (clientSafe as unknown as Record<string, unknown>), false);
  });

  it("assina e valida token administrativo", () => {
    const now = Date.UTC(2026, 10, 18, 20, 0, 0);
    const token = createAdminSessionToken(
      {
        admin_id: "00000000-0000-0000-0000-000000000099",
        username: "sindico",
        nome_exibicao: "Síndico Milano",
      },
      TEST_SECRET,
      now
    );
    const parsed = verifySignedPayload<AdminCookieSession>(token, TEST_SECRET, now + 60_000);
    assert.ok(parsed);
    assert.equal(parsed.username, "sindico");
  });

  it("aplica rate limit por janela deslizante", () => {
    const key = `test-ip-${Math.random()}`;
    const t0 = 1_700_000_000_000;
    assert.equal(checkRateLimit(key, 3, 60_000, t0).allowed, true);
    assert.equal(checkRateLimit(key, 3, 60_000, t0 + 1000).allowed, true);
    assert.equal(checkRateLimit(key, 3, 60_000, t0 + 2000).allowed, true);

    const blocked = checkRateLimit(key, 3, 60_000, t0 + 3000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 56);

    // Após expirar a janela, volta a permitir
    assert.equal(checkRateLimit(key, 3, 60_000, t0 + 61_000).allowed, true);
  });
});
