-- ============================================================================
-- Migração 003: Limite de 1 Reserva por Local/Mês por CPF, Cancelamento pelo
--               Próprio Morador e Feriados Oficiais de Dourados - MS / MS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Atualizar Feriados Locais para Dourados - MS e Mato Grosso do Sul (MS)
--    Remove feriados municipais antigos de Campo Grande e registra os oficiais
--    de Dourados - MS (Lei Municipal nº 662/1967) e MS (Lei Estadual nº 10/1979).
-- ----------------------------------------------------------------------------
DELETE FROM public.agenda_feriados
WHERE origem = 'MANUAL'
  AND nome IN (
    'Dia de Santo Antônio (Padroeiro de Campo Grande)',
    'Aniversário de Campo Grande'
  );

INSERT INTO public.agenda_feriados (data, nome, tipo, origem, ativo)
VALUES
  (DATE '2026-10-11', 'Criação do Estado de Mato Grosso do Sul', 'ESTADUAL', 'MANUAL', true),
  (DATE '2026-12-08', 'Nossa Senhora da Imaculada Conceição (Padroeira de Dourados)', 'MUNICIPAL', 'MANUAL', true),
  (DATE '2026-12-20', 'Aniversário de Dourados', 'MUNICIPAL', 'MANUAL', true),
  (DATE '2027-10-11', 'Criação do Estado de Mato Grosso do Sul', 'ESTADUAL', 'MANUAL', true),
  (DATE '2027-12-08', 'Nossa Senhora da Imaculada Conceição (Padroeira de Dourados)', 'MUNICIPAL', 'MANUAL', true),
  (DATE '2027-12-20', 'Aniversário de Dourados', 'MUNICIPAL', 'MANUAL', true)
ON CONFLICT (data) DO UPDATE
SET
  nome = EXCLUDED.nome,
  tipo = EXCLUDED.tipo,
  origem = 'MANUAL',
  ativo = true;

-- ----------------------------------------------------------------------------
-- 2. Função IMMUTABLE de chave YYYYMM para Trava Física Mensal por Espaço
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_ano_mes(p_data date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT (EXTRACT(YEAR FROM p_data)::integer * 100) + EXTRACT(MONTH FROM p_data)::integer;
$$;

-- Higieniza eventuais reservas pendentes duplicadas no mesmo espaço/mês anteriores à regra
WITH duplicadas AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY titular_cpf_hash, espaco_id, public.agenda_ano_mes(data_reserva)
      ORDER BY
        CASE WHEN status = 'CONFIRMADO' THEN 0 ELSE 1 END,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.agenda_reservas
  WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO')
)
UPDATE public.agenda_reservas r
SET
  status = 'CANCELADO',
  cancelado_em = now(),
  motivo_cancelamento = 'Ajuste automático: limite de 1 reserva por local por mês'
FROM duplicadas d
WHERE r.id = d.id
  AND d.rn > 1
  AND r.status = 'PENDENTE_PAGAMENTO';

-- Trava física 3: máximo 1 reserva ativa por local (espaço) no mês por CPF
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_reservas_titular_espaco_mes_ativa
  ON public.agenda_reservas (titular_cpf_hash, espaco_id, public.agenda_ano_mes(data_reserva))
  WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO');

-- ----------------------------------------------------------------------------
-- 3. Atualizar agenda_criar_reserva com Trava Mensal por Espaço e Mensagem Limpa
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_criar_reserva(
  p_espaco_id uuid,
  p_unidade_id uuid,
  p_identificacao_publica text,
  p_titular_cpf_hash text,
  p_data date,
  p_aceite_capacidade boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.agenda_config%ROWTYPE;
  v_espaco public.agenda_espacos%ROWTYPE;
  v_unidade record;
  v_now timestamptz := now();
  v_hoje_local date;
  v_abertura timestamptz;
  v_ano_mes integer;
  v_preco jsonb;
  v_expires_at timestamptz;
  v_reserva public.agenda_reservas%ROWTYPE;
  v_identificacao text := btrim(COALESCE(p_identificacao_publica, ''));
  v_constraint text;
BEGIN
  SELECT * INTO v_cfg FROM public.agenda_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuração da agenda (id=1) não encontrada.';
  END IF;

  IF p_espaco_id IS NULL OR p_unidade_id IS NULL OR p_data IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PARAMETROS_INVALIDOS',
      'status_http', 400,
      'message', 'Dados obrigatórios da reserva ausentes.'
    );
  END IF;

  IF p_titular_cpf_hash IS NULL OR p_titular_cpf_hash !~ '^[a-f0-9]{64}$' OR v_identificacao = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TITULAR_INVALIDO',
      'status_http', 400,
      'message', 'Sessão de morador inválida. Identifique-se novamente pelo CPF.'
    );
  END IF;

  SELECT * INTO v_espaco FROM public.agenda_espacos WHERE id = p_espaco_id AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ESPACO_NAO_ENCONTRADO',
      'status_http', 404,
      'message', 'Espaço não encontrado ou indisponível.'
    );
  END IF;

  SELECT id, bloco, apartamento
  INTO v_unidade
  FROM public.unidades_milano
  WHERE id = p_unidade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'UNIDADE_NAO_ENCONTRADA',
      'status_http', 404,
      'message', 'Unidade não localizada na base oficial.'
    );
  END IF;

  IF v_espaco.exige_aceite_capacidade AND COALESCE(p_aceite_capacidade, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ACEITE_CAPACIDADE_OBRIGATORIO',
      'status_http', 400,
      'message', format(
        'É obrigatório aceitar a capacidade máxima de %s pessoas para reservar %s.',
        COALESCE(v_espaco.capacidade_maxima, 100),
        v_espaco.nome
      )
    );
  END IF;

  v_hoje_local := (v_now AT TIME ZONE v_cfg.timezone)::date;
  IF p_data < v_hoje_local THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DATA_PASSADA',
      'status_http', 400,
      'message', 'Não é possível agendar uma data anterior ao dia de hoje.'
    );
  END IF;

  v_abertura := public.agenda_abertura_lote(p_data);
  IF v_now < v_abertura THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'LOTE_FECHADO',
      'status_http', 403,
      'abertura_em', v_abertura,
      'server_now', v_now,
      'message', format(
        'Agendamentos para este mês abrem apenas em %s.',
        to_char(v_abertura AT TIME ZONE v_cfg.timezone, 'DD/MM/YYYY "às" HH24:MI')
      )
    );
  END IF;

  v_ano_mes := public.agenda_ano_mes(p_data);

  -- Ordem determinística de locks transacionais para evitar deadlocks sob pico às 20:00
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_espaco:' || p_espaco_id::text || ':' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_cpf:' || p_titular_cpf_hash || ':' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_cpf_espaco_mes:' || p_titular_cpf_hash || ':' || p_espaco_id::text || ':' || v_ano_mes::text, 0));

  -- Lazy expiration: libera pendentes vencidos (> 48h) na data OU na cota mensal do espaço
  UPDATE public.agenda_reservas
  SET status = 'EXPIRADO'
  WHERE status = 'PENDENTE_PAGAMENTO'
    AND expires_at <= v_now
    AND (
      (data_reserva = p_data AND (espaco_id = p_espaco_id OR titular_cpf_hash = p_titular_cpf_hash))
      OR (
        titular_cpf_hash = p_titular_cpf_hash
        AND espaco_id = p_espaco_id
        AND public.agenda_ano_mes(data_reserva) = v_ano_mes
      )
    );

  -- Checagem 1: espaço já ocupado nesta data
  IF EXISTS (
    SELECT 1
    FROM public.agenda_reservas
    WHERE espaco_id = p_espaco_id
      AND data_reserva = p_data
      AND status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ESPACO_OCUPADO',
      'status_http', 409,
      'message', 'Esta data acabou de ser reservada por outro morador.'
    );
  END IF;

  -- Checagem 2: limite de 1 reserva ativa por data por CPF
  IF EXISTS (
    SELECT 1
    FROM public.agenda_reservas
    WHERE titular_cpf_hash = p_titular_cpf_hash
      AND data_reserva = p_data
      AND status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TITULAR_JA_RESERVOU_DATA',
      'status_http', 409,
      'message', 'Seu CPF já possui uma reserva ativa nesta data (limite máximo de 1 reserva por data).'
    );
  END IF;

  -- Checagem 3: limite de 1 reserva ativa por local (espaço) no mesmo mês por CPF
  IF EXISTS (
    SELECT 1
    FROM public.agenda_reservas
    WHERE titular_cpf_hash = p_titular_cpf_hash
      AND espaco_id = p_espaco_id
      AND public.agenda_ano_mes(data_reserva) = v_ano_mes
      AND status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO')
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'LIMITE_MENSAL_ESPACO',
      'status_http', 409,
      'message', format(
        'Você já possui uma reserva ativa de %s neste mês (limite de 1 reserva por local no mês).',
        v_espaco.nome
      )
    );
  END IF;

  v_preco := public.agenda_calcular_preco(p_espaco_id, p_data);
  IF COALESCE((v_preco->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_preco || jsonb_build_object('status_http', 400);
  END IF;

  v_expires_at := v_now + make_interval(hours => v_cfg.prazo_pagamento_horas);

  BEGIN
    INSERT INTO public.agenda_reservas (
      espaco_id,
      unidade_id,
      bloco,
      apartamento,
      identificacao_publica,
      titular_cpf_hash,
      data_reserva,
      status,
      valor_centavos,
      regra_tarifa,
      aceite_capacidade,
      aceite_capacidade_em,
      created_at,
      expires_at
    )
    VALUES (
      p_espaco_id,
      v_unidade.id,
      v_unidade.bloco,
      v_unidade.apartamento,
      v_identificacao,
      p_titular_cpf_hash,
      p_data,
      'PENDENTE_PAGAMENTO',
      (v_preco->>'valor_centavos')::integer,
      v_preco->>'regra_tarifa',
      CASE WHEN v_espaco.exige_aceite_capacidade THEN true ELSE COALESCE(p_aceite_capacidade, false) END,
      CASE WHEN v_espaco.exige_aceite_capacidade THEN v_now ELSE NULL END,
      v_now,
      v_expires_at
    )
    RETURNING * INTO v_reserva;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_agenda_reservas_titular_espaco_mes_ativa' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'LIMITE_MENSAL_ESPACO',
          'status_http', 409,
          'message', format(
            'Você já possui uma reserva ativa de %s neste mês (limite de 1 reserva por local no mês).',
            v_espaco.nome
          )
        );
      END IF;
      IF v_constraint = 'uq_agenda_reservas_titular_data_ativa' THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'TITULAR_JA_RESERVOU_DATA',
          'status_http', 409,
          'message', 'Seu CPF já possui uma reserva ativa nesta data (limite máximo de 1 reserva por data).'
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'ESPACO_OCUPADO',
        'status_http', 409,
        'message', 'Esta data acabou de ser reservada por outro morador.'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'status_http', 201,
    'reserva', jsonb_build_object(
      'id', v_reserva.id,
      'espaco_id', v_reserva.espaco_id,
      'espaco_nome', v_espaco.nome,
      'espaco_descricao', v_espaco.descricao_localizacao,
      'data_reserva', v_reserva.data_reserva,
      'bloco', v_reserva.bloco,
      'apartamento', v_reserva.apartamento,
      'identificacao_publica', v_reserva.identificacao_publica,
      'status', v_reserva.status,
      'valor_centavos', v_reserva.valor_centavos,
      'regra_tarifa', v_reserva.regra_tarifa,
      'aceite_capacidade', v_reserva.aceite_capacidade,
      'created_at', v_reserva.created_at,
      'expires_at', v_reserva.expires_at
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Auto-cancelamento / Exclusão de Reserva Pendente pelo Próprio Morador
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_cancelar_reserva_morador(
  p_reserva_id uuid,
  p_titular_cpf_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva public.agenda_reservas%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_reserva_id IS NULL OR p_titular_cpf_hash IS NULL OR p_titular_cpf_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PARAMETROS_INVALIDOS',
      'status_http', 400,
      'message', 'Parâmetros inválidos para cancelar a reserva.'
    );
  END IF;

  SELECT * INTO v_reserva
  FROM public.agenda_reservas
  WHERE id = p_reserva_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RESERVA_NAO_ENCONTRADA',
      'status_http', 404,
      'message', 'Reserva não encontrada.'
    );
  END IF;

  IF v_reserva.titular_cpf_hash <> p_titular_cpf_hash THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NAO_AUTORIZADO',
      'status_http', 403,
      'message', 'Você só pode cancelar reservas vinculadas ao seu próprio CPF.'
    );
  END IF;

  IF v_reserva.status = 'CANCELADO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'JA_CANCELADA',
      'status_http', 409,
      'message', 'Esta reserva já está cancelada.'
    );
  END IF;

  IF v_reserva.status = 'EXPIRADO' OR (v_reserva.status = 'PENDENTE_PAGAMENTO' AND v_reserva.expires_at <= v_now) THEN
    IF v_reserva.status = 'PENDENTE_PAGAMENTO' THEN
      UPDATE public.agenda_reservas
      SET status = 'EXPIRADO'
      WHERE id = v_reserva.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'status_http', 200,
      'reserva_id', v_reserva.id,
      'status', 'EXPIRADO',
      'message', 'Esta reserva já havia expirado e a data já está liberada.'
    );
  END IF;

  IF v_reserva.status = 'CONFIRMADO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'JA_CONFIRMADA_CONTATAR_SINDICO',
      'status_http', 409,
      'message', 'Esta reserva já foi paga e confirmada. Solicite o cancelamento diretamente ao síndico.'
    );
  END IF;

  UPDATE public.agenda_reservas
  SET
    status = 'CANCELADO',
    cancelado_em = v_now,
    cancelado_por = NULL,
    motivo_cancelamento = 'Cancelado pelo próprio morador'
  WHERE id = v_reserva.id
  RETURNING * INTO v_reserva;

  RETURN jsonb_build_object(
    'ok', true,
    'status_http', 200,
    'reserva_id', v_reserva.id,
    'status', v_reserva.status,
    'cancelado_em', v_reserva.cancelado_em,
    'message', 'Reserva cancelada com sucesso. A data e sua cota mensal para este espaço foram liberadas.'
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.agenda_ano_mes(date),
  public.agenda_cancelar_reserva_morador(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.agenda_cancelar_reserva_morador(uuid, text)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
