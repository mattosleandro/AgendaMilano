export type ReservaStatus =
  | "PENDENTE_PAGAMENTO"
  | "CONFIRMADO"
  | "EXPIRADO"
  | "CANCELADO";

export type ReservaPublicaStatus = "PENDENTE_PAGAMENTO" | "CONFIRMADO";

export type FeriadoTipo = "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "CONDOMINIO";

export type FeriadoOrigem = "BRASILAPI" | "MANUAL";

export type RegraTarifa =
  | "SEG_A_QUI"
  | "SEXTA"
  | "SABADO"
  | "DOMINGO"
  | "FERIADO";

export interface AgendaConfig {
  timezone: string;
  dia_abertura_lote: number;
  hora_abertura_lote: string;
  prazo_pagamento_horas: number;
}

export interface Espaco {
  id: string;
  slug: string;
  nome: string;
  descricao_localizacao: string;
  capacidade_maxima: number | null;
  exige_aceite_capacidade: boolean;
  preco_seg_qui_centavos: number;
  preco_sex_centavos: number;
  preco_fds_feriado_centavos: number;
  ativo: boolean;
  ordem: number;
}

export interface FeriadoPublico {
  id: string;
  data: string;
  nome: string;
  tipo: FeriadoTipo;
  origem: FeriadoOrigem;
  ativo: boolean;
}

/**
 * Projeção pública estritamente livre de PII (LGPD).
 * Contém apenas identificação de Bloco/Apartamento e status da reserva.
 */
export interface ReservaPublica {
  id: string;
  espaco_id: string;
  data_reserva: string;
  bloco: number;
  apartamento: number;
  identificacao_publica: string;
  status_efetivo: ReservaPublicaStatus;
  expires_at: string;
}

export interface UnidadeResumo {
  unidade_id: string;
  bloco: number;
  apartamento: number;
  label: string;
}

/**
 * Payload armazenado exclusivamente no cookie HttpOnly assinado no servidor.
 * Nunca serializar `titular_cpf_hash` para rotas públicas ou props do cliente.
 */
export interface MoradorCookieSession {
  unidade_principal_id: string;
  bloco: number;
  apartamento: number;
  quantidade_unidades: number;
  identificacao_publica: string;
  titular_cpf_hash: string;
  unidades: UnidadeResumo[];
  exp: number;
}

/**
 * Subconjunto seguro enviado para a interface do morador autenticado.
 */
export interface MoradorPublicSession {
  identificacao_publica: string;
  quantidade_unidades: number;
  bloco: number;
  apartamento: number;
}

export interface MinhaReserva {
  id: string;
  espaco_id: string;
  espaco_nome: string;
  espaco_slug: string;
  espaco_descricao: string;
  data_reserva: string;
  identificacao_publica: string;
  status: ReservaStatus;
  valor_centavos: number;
  regra_tarifa: string;
  aceite_capacidade: boolean;
  created_at: string;
  expires_at: string;
  confirmado_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  codigo_recibo: string | null;
}

export interface ReciboDigital {
  id: string;
  codigo_recibo: string;
  hash_sha256: string;
  bloco: number;
  apartamento: number;
  identificacao_publica: string;
  espaco_nome: string;
  espaco_descricao: string;
  data_reserva: string;
  valor_centavos: number;
  forma_pagamento: "DINHEIRO_ESPECIE";
  emitido_em: string;
}

export interface ReciboVerificacaoResponse {
  ok: boolean;
  integridade_valida: boolean;
  status_reserva: ReservaStatus;
  cancelado_em: string | null;
  recibo: ReciboDigital;
}

export interface AdminCookieSession {
  admin_id: string;
  username: string;
  nome_exibicao: string;
  exp: number;
}

export interface AdminReservaItem {
  id: string;
  espaco_id: string;
  espaco_nome: string;
  espaco_slug: string;
  espaco_descricao: string;
  data_reserva: string;
  bloco: number;
  apartamento: number;
  identificacao_publica: string;
  status: ReservaStatus;
  status_efetivo: ReservaStatus;
  valor_centavos: number;
  regra_tarifa: string;
  aceite_capacidade: boolean;
  created_at: string;
  expires_at: string;
  confirmado_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  codigo_recibo: string | null;
}

export interface AgendaMesResponse {
  year: number;
  month: number;
  serverNow: string;
  todayLocal: string;
  config: AgendaConfig;
  monthUnlocked: boolean;
  openingAt: string;
  espacos: Espaco[];
  feriados: FeriadoPublico[];
  reservas: ReservaPublica[];
}
