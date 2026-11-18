-- ============================================================================
-- Fase 2: Motor de Regras, Precificação, Abertura Dia 25 20h, RPCs Atômicas e pg_cron
-- Condomínio: Milano Condomínio Club (agenda.portalmilano.com)
-- Fuso Horário Canônico: America/Campo_Grande (UTC-4)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Instante Canônico de Abertura do Lote (Dia 25 às 20:00 do mês anterior)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_abertura_lote(p_data date)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.agenda_config%ROWTYPE;
  v_mes_anterior date;
  v_data_abertura date;
BEGIN
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Data alvo obrigatória para cálculo de abertura do lote.';
  END IF;

  SELECT * INTO v_cfg FROM public.agenda_config WHERE id = 1;
  IF NOT FOUND THEN
    v_cfg.timezone := 'America/Campo_Grande';
    v_cfg.dia_abertura_lote := 25;
    v_cfg.hora_abertura_lote := TIME '20:00:00';
  END IF;

  -- 1º dia do mês imediatamente anterior à data alvo
  v_mes_anterior := (date_trunc('month', p_data)::date - interval '1 month')::date;
  v_data_abertura := make_date(
    EXTRACT(YEAR FROM v_mes_anterior)::integer,
    EXTRACT(MONTH FROM v_mes_anterior)::integer,
    v_cfg.dia_abertura_lote::integer
  );

  RETURN (v_data_abertura + v_cfg.hora_abertura_lote) AT TIME ZONE v_cfg.timezone;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Motor de Precificação Dinâmica (Seg-Qui / Sex / Sáb-Dom-Feriado)
--    Regra: Véspera de feriado NÃO altera a tarifa.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_calcular_preco(
  p_espaco_id uuid,
  p_data date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_espaco public.agenda_espacos%ROWTYPE;
  v_feriado public.agenda_feriados%ROWTYPE;
  v_eh_feriado boolean := false;
  v_isodow integer;
  v_valor integer;
  v_regra text;
BEGIN
  IF p_espaco_id IS NULL OR p_data IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PARAMETROS_INVALIDOS',
      'message', 'Espaço e data são obrigatórios para calcular o valor.'
    );
  END IF;

  SELECT *
  INTO v_espaco
  FROM public.agenda_espacos
  WHERE id = p_espaco_id AND ativo = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ESPACO_NAO_ENCONTRADO',
      'message', 'Espaço não encontrado ou inativo.'
    );
  END IF;

  -- Verifica apenas se a própria data é feriado ativo (véspera nunca altera preço)
  SELECT *
  INTO v_feriado
  FROM public.agenda_feriados
  WHERE data = p_data AND ativo = true
  LIMIT 1;

  v_eh_feriado := FOUND;
  v_isodow := EXTRACT(ISODOW FROM p_data)::integer; -- 1=Seg .. 5=Sex .. 6=Sáb .. 7=Dom

  IF v_eh_feriado OR v_isodow IN (6, 7) THEN
    v_valor := v_espaco.preco_fds_feriado_centavos;
    v_regra := CASE
      WHEN v_eh_feriado THEN 'FERIADO'
      WHEN v_isodow = 6 THEN 'SABADO'
      ELSE 'DOMINGO'
    END;
  ELSIF v_isodow = 5 THEN
    v_valor := v_espaco.preco_sex_centavos;
    v_regra := 'SEXTA';
  ELSE
    v_valor := v_espaco.preco_seg_qui_centavos;
    v_regra := 'SEG_A_QUI';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'espaco_id', v_espaco.id,
    'slug', v_espaco.slug,
    'valor_centavos', v_valor,
    'regra_tarifa', v_regra,
    'eh_feriado', v_eh_feriado,
    'feriado_nome', CASE WHEN v_eh_feriado THEN v_feriado.nome ELSE NULL END,
    'dia_semana_iso', v_isodow
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Varredura de Expiração de Reservas Pendentes (> 48h corridas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_expirar_reservas_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atualizadas integer := 0;
BEGIN
  UPDATE public.agenda_reservas
  SET status = 'EXPIRADO'
  WHERE status = 'PENDENTE_PAGAMENTO'
    AND expires_at <= now();

  GET DIAGNOSTICS v_atualizadas = ROW_COUNT;
  RETURN v_atualizadas;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Criação Atômica de Reserva (Anti-Race Condition + Máx 1/Data/CPF + Lazy Exp)
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

  -- Trava obrigatória de capacidade máxima (100 pessoas no Salão de Festas)
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

  -- Validação temporal autoritativa no fuso de Campo Grande
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
        'Agendamentos para este mês abrem apenas em %s (horário de Campo Grande).',
        to_char(v_abertura AT TIME ZONE v_cfg.timezone, 'DD/MM/YYYY "às" HH24:MI')
      )
    );
  END IF;

  -- Ordem determinística de locks transacionais para evitar deadlocks sob pico às 20:00
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_espaco:' || p_espaco_id::text || ':' || p_data::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_cpf:' || p_titular_cpf_hash || ':' || p_data::text, 0));

  -- Lazy expiration: libera no milissegundo exato qualquer pendente vencido (> 48h)
  UPDATE public.agenda_reservas
  SET status = 'EXPIRADO'
  WHERE data_reserva = p_data
    AND status = 'PENDENTE_PAGAMENTO'
    AND expires_at <= v_now
    AND (espaco_id = p_espaco_id OR titular_cpf_hash = p_titular_cpf_hash);

  -- Checagem explícita para mensagem clara antes mesmo de bater no índice único
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
-- 5. Confirmação Atômica de Pagamento em Espécie + Geração de Recibo Auditável
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_confirmar_pagamento(
  p_reserva_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.agenda_config%ROWTYPE;
  v_admin public.agenda_admins%ROWTYPE;
  v_reserva public.agenda_reservas%ROWTYPE;
  v_espaco public.agenda_espacos%ROWTYPE;
  v_recibo public.agenda_recibos%ROWTYPE;
  v_now timestamptz := date_trunc('milliseconds', now());
  v_ano text;
  v_codigo text;
  v_hash_payload text;
  v_hash text;
BEGIN
  IF p_reserva_id IS NULL OR p_admin_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PARAMETROS_INVALIDOS',
      'status_http', 400,
      'message', 'Reserva e administrador são obrigatórios.'
    );
  END IF;

  SELECT * INTO v_cfg FROM public.agenda_config WHERE id = 1;
  SELECT * INTO v_admin FROM public.agenda_admins WHERE id = p_admin_id AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_INVALIDO',
      'status_http', 403,
      'message', 'Administrador inativo ou não encontrado.'
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

  IF v_reserva.status = 'CONFIRMADO' THEN
    SELECT * INTO v_recibo FROM public.agenda_recibos WHERE reserva_id = v_reserva.id;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'JA_CONFIRMADA',
      'status_http', 409,
      'codigo_recibo', v_recibo.codigo_recibo,
      'message', 'O pagamento desta reserva já foi confirmado anteriormente.'
    );
  END IF;

  IF v_reserva.status = 'CANCELADO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RESERVA_CANCELADA',
      'status_http', 409,
      'message', 'Esta reserva já foi cancelada e não pode ser confirmada.'
    );
  END IF;

  IF v_reserva.status = 'EXPIRADO' OR (v_reserva.status = 'PENDENTE_PAGAMENTO' AND v_reserva.expires_at <= v_now) THEN
    IF v_reserva.status = 'PENDENTE_PAGAMENTO' THEN
      UPDATE public.agenda_reservas
      SET status = 'EXPIRADO'
      WHERE id = v_reserva.id;
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'RESERVA_EXPIRADA',
      'status_http', 409,
      'message', 'Prazo de 48 horas expirado. A data já foi liberada na agenda.'
    );
  END IF;

  SELECT * INTO v_espaco FROM public.agenda_espacos WHERE id = v_reserva.espaco_id;

  UPDATE public.agenda_reservas
  SET
    status = 'CONFIRMADO',
    confirmado_em = v_now,
    confirmado_por = v_admin.id
  WHERE id = v_reserva.id
  RETURNING * INTO v_reserva;

  v_ano := to_char(v_now AT TIME ZONE COALESCE(v_cfg.timezone, 'America/Campo_Grande'), 'YYYY');
  LOOP
    v_codigo := 'MIL-' || v_ano || '-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agenda_recibos WHERE codigo_recibo = v_codigo);
  END LOOP;

  v_hash_payload := concat_ws(
    '|',
    v_codigo,
    v_reserva.id::text,
    v_reserva.identificacao_publica,
    v_espaco.nome,
    v_reserva.data_reserva::text,
    v_reserva.valor_centavos::text,
    'DINHEIRO_ESPECIE',
    to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_hash := encode(extensions.digest(convert_to(v_hash_payload, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.agenda_recibos (
    reserva_id,
    codigo_recibo,
    hash_sha256,
    bloco,
    apartamento,
    identificacao_publica,
    espaco_nome,
    espaco_descricao,
    data_reserva,
    valor_centavos,
    forma_pagamento,
    emitido_em,
    emitido_por
  )
  VALUES (
    v_reserva.id,
    v_codigo,
    v_hash,
    v_reserva.bloco,
    v_reserva.apartamento,
    v_reserva.identificacao_publica,
    v_espaco.nome,
    v_espaco.descricao_localizacao,
    v_reserva.data_reserva,
    v_reserva.valor_centavos,
    'DINHEIRO_ESPECIE',
    v_now,
    v_admin.id
  )
  RETURNING * INTO v_recibo;

  RETURN jsonb_build_object(
    'ok', true,
    'status_http', 200,
    'reserva_id', v_reserva.id,
    'status', v_reserva.status,
    'confirmado_em', v_reserva.confirmado_em,
    'recibo', jsonb_build_object(
      'id', v_recibo.id,
      'codigo_recibo', v_recibo.codigo_recibo,
      'hash_sha256', v_recibo.hash_sha256,
      'identificacao_publica', v_recibo.identificacao_publica,
      'espaco_nome', v_recibo.espaco_nome,
      'espaco_descricao', v_recibo.espaco_descricao,
      'data_reserva', v_recibo.data_reserva,
      'valor_centavos', v_recibo.valor_centavos,
      'forma_pagamento', v_recibo.forma_pagamento,
      'emitido_em', v_recibo.emitido_em
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Cancelamento Manual Auditado (Painel do Síndico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_cancelar_reserva(
  p_reserva_id uuid,
  p_admin_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin public.agenda_admins%ROWTYPE;
  v_reserva public.agenda_reservas%ROWTYPE;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
  v_now timestamptz := now();
BEGIN
  IF p_reserva_id IS NULL OR p_admin_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'PARAMETROS_INVALIDOS',
      'status_http', 400,
      'message', 'Reserva e administrador são obrigatórios.'
    );
  END IF;

  IF length(v_motivo) < 3 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MOTIVO_OBRIGATORIO',
      'status_http', 400,
      'message', 'Informe um motivo válido (mínimo 3 caracteres) para cancelar a reserva.'
    );
  END IF;

  SELECT * INTO v_admin FROM public.agenda_admins WHERE id = p_admin_id AND ativo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_INVALIDO',
      'status_http', 403,
      'message', 'Administrador inativo ou não encontrado.'
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

  IF v_reserva.status = 'CANCELADO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'JA_CANCELADA',
      'status_http', 409,
      'message', 'Esta reserva já está cancelada.'
    );
  END IF;

  IF v_reserva.status = 'EXPIRADO' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'JA_EXPIRADA',
      'status_http', 409,
      'message', 'Esta reserva já expirou automaticamente.'
    );
  END IF;

  UPDATE public.agenda_reservas
  SET
    status = 'CANCELADO',
    cancelado_em = v_now,
    cancelado_por = v_admin.id,
    motivo_cancelamento = v_motivo
  WHERE id = v_reserva.id
  RETURNING * INTO v_reserva;

  RETURN jsonb_build_object(
    'ok', true,
    'status_http', 200,
    'reserva_id', v_reserva.id,
    'status', v_reserva.status,
    'cancelado_em', v_reserva.cancelado_em
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6b. Verificação Auditável de Recibo Digital (Sem PII)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_verificar_recibo(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_codigo text := upper(btrim(COALESCE(p_codigo, '')));
  v_recibo public.agenda_recibos%ROWTYPE;
  v_reserva public.agenda_reservas%ROWTYPE;
  v_hash_payload text;
  v_hash_calculado text;
BEGIN
  IF v_codigo = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CODIGO_INVALIDO', 'message', 'Código do recibo obrigatório.');
  END IF;

  SELECT * INTO v_recibo FROM public.agenda_recibos WHERE codigo_recibo = v_codigo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECIBO_NAO_ENCONTRADO', 'message', 'Recibo não localizado.');
  END IF;

  SELECT * INTO v_reserva FROM public.agenda_reservas WHERE id = v_recibo.reserva_id;

  v_hash_payload := concat_ws(
    '|',
    v_recibo.codigo_recibo,
    v_recibo.reserva_id::text,
    v_recibo.identificacao_publica,
    v_recibo.espaco_nome,
    v_recibo.data_reserva::text,
    v_recibo.valor_centavos::text,
    v_recibo.forma_pagamento,
    to_char(v_recibo.emitido_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_hash_calculado := encode(extensions.digest(convert_to(v_hash_payload, 'UTF8'), 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'ok', true,
    'integridade_valida', (v_hash_calculado = v_recibo.hash_sha256),
    'status_reserva', v_reserva.status,
    'cancelado_em', v_reserva.cancelado_em,
    'recibo', jsonb_build_object(
      'id', v_recibo.id,
      'codigo_recibo', v_recibo.codigo_recibo,
      'hash_sha256', v_recibo.hash_sha256,
      'bloco', v_recibo.bloco,
      'apartamento', v_recibo.apartamento,
      'identificacao_publica', v_recibo.identificacao_publica,
      'espaco_nome', v_recibo.espaco_nome,
      'espaco_descricao', v_recibo.espaco_descricao,
      'data_reserva', v_recibo.data_reserva,
      'valor_centavos', v_recibo.valor_centavos,
      'forma_pagamento', v_recibo.forma_pagamento,
      'emitido_em', v_recibo.emitido_em
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permissões de Funções (Apenas service_role)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.agenda_abertura_lote(date),
  public.agenda_calcular_preco(uuid, date),
  public.agenda_expirar_reservas_vencidas(),
  public.agenda_criar_reserva(uuid, uuid, text, text, date, boolean),
  public.agenda_confirmar_pagamento(uuid, uuid),
  public.agenda_cancelar_reserva(uuid, uuid, text),
  public.agenda_verificar_recibo(text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.agenda_abertura_lote(date),
  public.agenda_calcular_preco(uuid, date),
  public.agenda_expirar_reservas_vencidas(),
  public.agenda_criar_reserva(uuid, uuid, text, text, date, boolean),
  public.agenda_confirmar_pagamento(uuid, uuid),
  public.agenda_cancelar_reserva(uuid, uuid, text),
  public.agenda_verificar_recibo(text)
TO service_role;

-- ----------------------------------------------------------------------------
-- 8. pg_cron: Varredura Proativa a Cada 1 Minuto
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'agenda_expirar_reservas_48h'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END
$$;

SELECT cron.schedule(
  'agenda_expirar_reservas_48h',
  '* * * * *',
  $$SELECT public.agenda_expirar_reservas_vencidas();$$
);

NOTIFY pgrst, 'reload schema';

COMMIT;
