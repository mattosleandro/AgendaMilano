import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCpfInput, isValidCpf, stripNonDigits } from "../src/lib/agenda/cpf.ts";
import {
  DEFAULT_AGENDA_CONFIG,
  formatCountdownParts,
  getBatchOpeningUtcMs,
  getZonedDateParts,
  isDateBookable,
  isMonthUnlocked,
} from "../src/lib/agenda/opening-window.ts";
import {
  calculateSpacePrice,
  formatBrlFromCents,
  formatDateTimeShortPtBr,
  getIsoDayOfWeek,
} from "../src/lib/agenda/pricing.ts";
import type { FeriadoPublico } from "../src/lib/agenda/types.ts";

const SALAO = {
  preco_seg_qui_centavos: 14000,
  preco_sex_centavos: 18000,
  preco_fds_feriado_centavos: 22000,
};

const QUIOSQUE = {
  preco_seg_qui_centavos: 7000,
  preco_sex_centavos: 9000,
  preco_fds_feriado_centavos: 9000,
};

describe("Motor de Precificação Dinâmica e Feriados", () => {
  const holidayMap = new Map<string, Pick<FeriadoPublico, "nome" | "tipo" | "ativo">>([
    ["2026-11-20", { nome: "Consciência Negra", tipo: "NACIONAL", ativo: true }],
    ["2026-08-26", { nome: "Aniversário de Campo Grande", tipo: "MUNICIPAL", ativo: true }],
    ["2026-12-08", { nome: "Feriado Desativado", tipo: "CONDOMINIO", ativo: false }],
  ]);

  it("calcula corretamente tarifas do Salão de Festas (Seg-Qui R$140, Sex R$180, Sáb/Dom/Feriado R$220)", () => {
    // 2026-11-16 (Segunda) .. 2026-11-19 (Quinta - véspera do feriado 20/11)
    for (const day of ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]) {
      const price = calculateSpacePrice(SALAO, day, holidayMap);
      assert.equal(price.valorCentavos, 14000);
      assert.equal(price.regraTarifa, "SEG_A_QUI");
      assert.equal(price.ehFeriado, false);
    }

    // 2026-11-27 (Sexta normal)
    const sex = calculateSpacePrice(SALAO, "2026-11-27", holidayMap);
    assert.equal(sex.valorCentavos, 18000);
    assert.equal(sex.regraTarifa, "SEXTA");

    // 2026-11-20 (Sexta-feira FERIADO) -> aplica tarifa feriado (22000)
    const sexFeriado = calculateSpacePrice(SALAO, "2026-11-20", holidayMap);
    assert.equal(sexFeriado.valorCentavos, 22000);
    assert.equal(sexFeriado.regraTarifa, "FERIADO");
    assert.equal(sexFeriado.ehFeriado, true);
    assert.equal(sexFeriado.feriadoNome, "Consciência Negra");

    // 2026-08-26 (Quarta-feira FERIADO municipal) -> 22000; véspera 25/08 (Terça) -> 14000!
    const vesperaMunicipal = calculateSpacePrice(SALAO, "2026-08-25", holidayMap);
    assert.equal(vesperaMunicipal.valorCentavos, 14000);
    assert.equal(vesperaMunicipal.regraTarifa, "SEG_A_QUI");
    assert.equal(vesperaMunicipal.ehFeriado, false);

    const municipal = calculateSpacePrice(SALAO, "2026-08-26", holidayMap);
    assert.equal(municipal.valorCentavos, 22000);
    assert.equal(municipal.regraTarifa, "FERIADO");

    // Sábado e Domingo
    assert.equal(calculateSpacePrice(SALAO, "2026-11-21", holidayMap).valorCentavos, 22000);
    assert.equal(calculateSpacePrice(SALAO, "2026-11-22", holidayMap).valorCentavos, 22000);

    // Feriado com ativo: false não altera tarifa normal de terça-feira (2026-12-08)
    const desativado = calculateSpacePrice(SALAO, "2026-12-08", holidayMap);
    assert.equal(desativado.valorCentavos, 14000);
    assert.equal(desativado.ehFeriado, false);
  });

  it("calcula corretamente tarifas dos Quiosques 1 e 2 (Seg-Qui R$70, Sex/Sáb/Dom/Feriado R$90, véspera sem alteração)", () => {
    // Véspera quinta-feira 2026-11-19 permanece R$70
    const vespera = calculateSpacePrice(QUIOSQUE, "2026-11-19", holidayMap);
    assert.equal(vespera.valorCentavos, 7000);
    assert.equal(vespera.regraTarifa, "SEG_A_QUI");

    // Sexta normal 2026-11-27 -> R$90
    assert.equal(calculateSpacePrice(QUIOSQUE, "2026-11-27", holidayMap).valorCentavos, 9000);
    // Sábado / Domingo / Feriado -> R$90
    assert.equal(calculateSpacePrice(QUIOSQUE, "2026-11-21", holidayMap).valorCentavos, 9000);
    assert.equal(calculateSpacePrice(QUIOSQUE, "2026-11-22", holidayMap).valorCentavos, 9000);
    assert.equal(calculateSpacePrice(QUIOSQUE, "2026-08-26", holidayMap).valorCentavos, 9000);
  });

  it("calcula dia da semana ISO, formata moeda BRL e hora 20:00 sem truncamento", () => {
    assert.equal(getIsoDayOfWeek("2026-11-18"), 3); // Quarta
    assert.equal(getIsoDayOfWeek("2026-11-22"), 7); // Domingo
    assert.match(formatBrlFromCents(22000), /R\$\s?220,00/);
    assert.equal(
      formatDateTimeShortPtBr("2026-11-26T00:00:00.000Z"),
      "25/11/2026 às 20:00"
    );
  });
});

describe("Regra de Abertura Mensal (Dia 25 às 20:00 America/Campo_Grande)", () => {
  it("calcula o instante exato de abertura em UTC para Campo Grande (UTC-4)", () => {
    // Dezembro 2026 abre em 25/11/2026 20:00:00 (UTC-4) => 2026-11-26T00:00:00.000Z
    const decOpen = getBatchOpeningUtcMs(2026, 12, DEFAULT_AGENDA_CONFIG);
    assert.equal(new Date(decOpen).toISOString(), "2026-11-26T00:00:00.000Z");

    // Virada de ano: Janeiro 2027 abre em 25/12/2026 20:00:00 (UTC-4) => 2026-12-26T00:00:00.000Z
    const janOpen = getBatchOpeningUtcMs(2027, 1, DEFAULT_AGENDA_CONFIG);
    assert.equal(new Date(janOpen).toISOString(), "2026-12-26T00:00:00.000Z");

    // Fevereiro -> Março 2026
    const marOpen = getBatchOpeningUtcMs(2026, 3, DEFAULT_AGENDA_CONFIG);
    assert.equal(new Date(marOpen).toISOString(), "2026-02-26T00:00:00.000Z");
  });

  it("bloqueia 1ms antes das 20:00 do dia 25 e libera exatamente às 20:00:00", () => {
    const exactOpenMs = Date.parse("2026-11-26T00:00:00.000Z");

    const before = isMonthUnlocked(2026, 12, exactOpenMs - 1, DEFAULT_AGENDA_CONFIG);
    assert.equal(before.unlocked, false);
    assert.equal(before.remainingMs, 1);

    const atOpen = isMonthUnlocked(2026, 12, exactOpenMs, DEFAULT_AGENDA_CONFIG);
    assert.equal(atOpen.unlocked, true);
    assert.equal(atOpen.remainingMs, 0);
  });

  it("respeita virada de dia local em America/Campo_Grande vs UTC", () => {
    // 2026-11-19T02:30:00Z ainda é 2026-11-18 22:30:00 em Campo Grande
    const lateNightMs = Date.parse("2026-11-19T02:30:00.000Z");
    const parts = getZonedDateParts(lateNightMs, "America/Campo_Grande");
    assert.equal(parts.ymd, "2026-11-18");
    assert.equal(parts.hour, 22);

    assert.equal(isDateBookable("2026-11-18", lateNightMs).bookable, true);
    assert.equal(isDateBookable("2026-11-17", lateNightMs).reason, "PAST_DATE");
    assert.equal(isDateBookable("2026-12-01", lateNightMs).reason, "LOCKED_BATCH");
  });

  it("formata contador regressivo corretamente", () => {
    const c = formatCountdownParts((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
    assert.deepEqual(c, { days: 2, hours: 3, minutes: 4, seconds: 5 });
  });
});

describe("Validação e Formatação de CPF", () => {
  it("valida dígitos verificadores módulo 11 e rejeita sequências inválidas", () => {
    assert.equal(isValidCpf("52998224725"), true);
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224726"), false);
    assert.equal(isValidCpf("11111111111"), false);
    assert.equal(isValidCpf(""), false);
    assert.equal(stripNonDigits("529.982.247-25"), "52998224725");
    assert.equal(formatCpfInput("52998224725"), "529.982.247-25");
  });
});
