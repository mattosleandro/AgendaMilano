/**
 * Utilitários puros para normalização, formatação e validação módulo 11 de CPF.
 */

export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const digits = stripNonDigits(value);
  if (!/^\d{11}$/.test(digits)) {
    return false;
  }

  // Rejeita sequências com todos os dígitos iguais (ex: 00000000000)
  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(digits[i]) * (10 - i);
  }
  const rem1 = 11 - (sum % 11);
  const dv1 = rem1 >= 10 ? 0 : rem1;
  if (dv1 !== Number(digits[9])) {
    return false;
  }

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (11 - i);
  }
  const rem2 = 11 - (sum % 11);
  const dv2 = rem2 >= 10 ? 0 : rem2;

  return dv2 === Number(digits[10]);
}

export function formatCpfInput(value: string): string {
  const digits = stripNonDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
