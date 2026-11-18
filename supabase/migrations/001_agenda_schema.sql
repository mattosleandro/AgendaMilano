-- ============================================================================
-- Fase 1: Schema Isolado da Agenda de Áreas Comuns (agenda_*)
-- Condomínio: Milano Condomínio Club (agenda.portalmilano.com)
-- Banco alvo: PostgreSQL 17.6 (Supabase autohospedado - supabase-db)
--
-- Regras Inegociáveis:
--   1. ZERO alterações nas 12 tabelas pré-existentes (incluindo unidades_milano).
--   2. Prefixagem obrigatória `agenda_*` no schema `public`.
--   3. Dupla trava física via Partial Unique Index:
--      - (espaco_id, data_reserva) ativa
--      - (titular_cpf_hash, data_reserva) ativa (máx. 1 reserva por data por CPF)
--   4. Sigilo absoluto (LGPD): bloqueio total de `anon`/`authenticated` e projeção
--      pública sem PII (`agenda_reservas_publicas`).
--   5. Autenticação do síndico isolada em `agenda_admins` com bcrypt (`pgcrypto`).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. Tipos Enumerados (Idempotentes)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'agenda_reserva_status'
  ) THEN
    CREATE TYPE public.agenda_reserva_status AS ENUM (
      'PENDENTE_PAGAMENTO',
      'CONFIRMADO',
      'EXPIRADO',
      'CANCELADO'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'agenda_feriado_tipo'
  ) THEN
    CREATE TYPE public.agenda_feriado_tipo AS ENUM (
      'NACIONAL',
      'ESTADUAL',
      'MUNICIPAL',
      'CONDOMINIO'
    );
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. Função Utilitária de Timestamp (updated_at)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Tabela de Configuração Global (Singleton id = 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'America/Campo_Grande',
  dia_abertura_lote smallint NOT NULL DEFAULT 25 CHECK (dia_abertura_lote BETWEEN 1 AND 28),
  hora_abertura_lote time NOT NULL DEFAULT '20:00:00',
  prazo_pagamento_horas integer NOT NULL DEFAULT 48 CHECK (prazo_pagamento_horas > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_agenda_config_updated_at ON public.agenda_config;
CREATE TRIGGER trg_agenda_config_updated_at
  BEFORE UPDATE ON public.agenda_config
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_set_updated_at();

INSERT INTO public.agenda_config (
  id,
  timezone,
  dia_abertura_lote,
  hora_abertura_lote,
  prazo_pagamento_horas
)
VALUES (1, 'America/Campo_Grande', 25, '20:00:00', 48)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Tabela Isolada de Administradores / Síndicos (agenda_admins)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL CHECK (btrim(username) <> '' AND username = lower(btrim(username))),
  nome_exibicao text NOT NULL CHECK (btrim(nome_exibicao) <> ''),
  password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
  ativo boolean NOT NULL DEFAULT true,
  ultimo_login_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_admins_username
  ON public.agenda_admins (lower(btrim(username)));

DROP TRIGGER IF EXISTS trg_agenda_admins_updated_at ON public.agenda_admins;
CREATE TRIGGER trg_agenda_admins_updated_at
  BEFORE UPDATE ON public.agenda_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Tabela de Espaços Comuns (agenda_espacos) + Seed Oficial
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_espacos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  descricao_localizacao text NOT NULL CHECK (btrim(descricao_localizacao) <> ''),
  capacidade_maxima integer CHECK (capacidade_maxima IS NULL OR capacidade_maxima > 0),
  exige_aceite_capacidade boolean NOT NULL DEFAULT false,
  preco_seg_qui_centavos integer NOT NULL CHECK (preco_seg_qui_centavos >= 0),
  preco_sex_centavos integer NOT NULL CHECK (preco_sex_centavos >= 0),
  preco_fds_feriado_centavos integer NOT NULL CHECK (preco_fds_feriado_centavos >= 0),
  ativo boolean NOT NULL DEFAULT true,
  ordem smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_agenda_espacos_updated_at ON public.agenda_espacos;
CREATE TRIGGER trg_agenda_espacos_updated_at
  BEFORE UPDATE ON public.agenda_espacos
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_set_updated_at();

INSERT INTO public.agenda_espacos (
  slug,
  nome,
  descricao_localizacao,
  capacidade_maxima,
  exige_aceite_capacidade,
  preco_seg_qui_centavos,
  preco_sex_centavos,
  preco_fds_feriado_centavos,
  ativo,
  ordem
)
VALUES
  (
    'salao-de-festas',
    'Salão de Festas',
    'Área social principal — capacidade máxima de 100 pessoas',
    100,
    true,
    14000,
    18000,
    22000,
    true,
    1
  ),
  (
    'quiosque-1',
    'Quiosque 1',
    'Em frente à quadra esportiva',
    NULL,
    false,
    7000,
    9000,
    9000,
    true,
    2
  ),
  (
    'quiosque-2',
    'Quiosque 2',
    'Em frente à quadra de areia',
    NULL,
    false,
    7000,
    9000,
    9000,
    true,
    3
  )
ON CONFLICT (slug) DO UPDATE
SET
  nome = EXCLUDED.nome,
  descricao_localizacao = EXCLUDED.descricao_localizacao,
  capacidade_maxima = EXCLUDED.capacidade_maxima,
  exige_aceite_capacidade = EXCLUDED.exige_aceite_capacidade,
  preco_seg_qui_centavos = EXCLUDED.preco_seg_qui_centavos,
  preco_sex_centavos = EXCLUDED.preco_sex_centavos,
  preco_fds_feriado_centavos = EXCLUDED.preco_fds_feriado_centavos,
  ordem = EXCLUDED.ordem;

-- ----------------------------------------------------------------------------
-- 6. Tabela de Feriados (BrasilAPI + Feriados Estaduais/Municipais Locais)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date UNIQUE NOT NULL,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  tipo public.agenda_feriado_tipo NOT NULL,
  origem text NOT NULL CHECK (origem IN ('BRASILAPI', 'MANUAL')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_feriados_data_ativo
  ON public.agenda_feriados (data)
  WHERE ativo = true;

DROP TRIGGER IF EXISTS trg_agenda_feriados_updated_at ON public.agenda_feriados;
CREATE TRIGGER trg_agenda_feriados_updated_at
  BEFORE UPDATE ON public.agenda_feriados
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Tabela de Reservas (agenda_reservas) + Dupla Trava Física
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  espaco_id uuid NOT NULL REFERENCES public.agenda_espacos(id) ON DELETE RESTRICT,
  unidade_id uuid NOT NULL REFERENCES public.unidades_milano(id) ON DELETE RESTRICT,
  bloco smallint NOT NULL CHECK (bloco >= 1 AND bloco <= 34),
  apartamento smallint NOT NULL CHECK (
    apartamento IN (101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 304, 401, 402, 403, 404)
  ),
  identificacao_publica text NOT NULL CHECK (btrim(identificacao_publica) <> ''),
  titular_cpf_hash text NOT NULL CHECK (titular_cpf_hash ~ '^[a-f0-9]{64}$'),
  data_reserva date NOT NULL,
  status public.agenda_reserva_status NOT NULL DEFAULT 'PENDENTE_PAGAMENTO',
  valor_centavos integer NOT NULL CHECK (valor_centavos >= 0),
  regra_tarifa text NOT NULL CHECK (btrim(regra_tarifa) <> ''),
  aceite_capacidade boolean NOT NULL DEFAULT false,
  aceite_capacidade_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmado_em timestamptz,
  confirmado_por uuid REFERENCES public.agenda_admins(id) ON DELETE RESTRICT,
  cancelado_em timestamptz,
  cancelado_por uuid REFERENCES public.agenda_admins(id) ON DELETE RESTRICT,
  motivo_cancelamento text,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_agenda_reservas_expiracao
    CHECK (expires_at > created_at),
  CONSTRAINT chk_agenda_reservas_confirmacao
    CHECK (
      status <> 'CONFIRMADO'
      OR (confirmado_em IS NOT NULL AND confirmado_por IS NOT NULL)
    ),
  CONSTRAINT chk_agenda_reservas_cancelamento
    CHECK (
      status <> 'CANCELADO'
      OR (cancelado_em IS NOT NULL AND btrim(COALESCE(motivo_cancelamento, '')) <> '')
    )
);

-- Trava física 1: impede reserva dupla no mesmo espaço e mesma data
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_reservas_espaco_data_ativa
  ON public.agenda_reservas (espaco_id, data_reserva)
  WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO');

-- Trava física 2: máximo 1 reserva ativa na mesma data por CPF (inclusive CPF com 2 aptos)
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_reservas_titular_data_ativa
  ON public.agenda_reservas (titular_cpf_hash, data_reserva)
  WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO');

-- Índices de consulta e expiração
CREATE INDEX IF NOT EXISTS idx_agenda_reservas_espaco_data
  ON public.agenda_reservas (espaco_id, data_reserva);

CREATE INDEX IF NOT EXISTS idx_agenda_reservas_pendentes_expiracao
  ON public.agenda_reservas (expires_at)
  WHERE status = 'PENDENTE_PAGAMENTO';

CREATE INDEX IF NOT EXISTS idx_agenda_reservas_titular_data
  ON public.agenda_reservas (titular_cpf_hash, data_reserva DESC);

CREATE INDEX IF NOT EXISTS idx_agenda_reservas_unidade_data
  ON public.agenda_reservas (unidade_id, data_reserva DESC);

DROP TRIGGER IF EXISTS trg_agenda_reservas_updated_at ON public.agenda_reservas;
CREATE TRIGGER trg_agenda_reservas_updated_at
  BEFORE UPDATE ON public.agenda_reservas
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Tabela de Recibos Digitais Auditáveis e Imutáveis (agenda_recibos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_recibos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id uuid UNIQUE NOT NULL REFERENCES public.agenda_reservas(id) ON DELETE RESTRICT,
  codigo_recibo text UNIQUE NOT NULL CHECK (codigo_recibo ~ '^MIL-[0-9]{4}-[A-Z0-9]{6,}$'),
  hash_sha256 text NOT NULL CHECK (hash_sha256 ~ '^[a-f0-9]{64}$'),
  bloco smallint NOT NULL CHECK (bloco >= 1 AND bloco <= 34),
  apartamento smallint NOT NULL CHECK (
    apartamento IN (101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 304, 401, 402, 403, 404)
  ),
  identificacao_publica text NOT NULL CHECK (btrim(identificacao_publica) <> ''),
  espaco_nome text NOT NULL CHECK (btrim(espaco_nome) <> ''),
  espaco_descricao text NOT NULL CHECK (btrim(espaco_descricao) <> ''),
  data_reserva date NOT NULL,
  valor_centavos integer NOT NULL CHECK (valor_centavos >= 0),
  forma_pagamento text NOT NULL DEFAULT 'DINHEIRO_ESPECIE' CHECK (forma_pagamento = 'DINHEIRO_ESPECIE'),
  emitido_em timestamptz NOT NULL DEFAULT now(),
  emitido_por uuid NOT NULL REFERENCES public.agenda_admins(id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.agenda_recibos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Recibos digitais emitidos são imutáveis e não podem ser alterados ou excluídos.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_recibos_imutavel ON public.agenda_recibos;
CREATE TRIGGER trg_agenda_recibos_imutavel
  BEFORE UPDATE OR DELETE ON public.agenda_recibos
  FOR EACH ROW
  EXECUTE FUNCTION public.agenda_recibos_imutavel();

-- ----------------------------------------------------------------------------
-- 9. Projeção Pública Livre de PII (agenda_reservas_publicas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.agenda_reservas_publicas AS
SELECT
  r.id,
  r.espaco_id,
  r.data_reserva,
  r.bloco,
  r.apartamento,
  r.identificacao_publica,
  r.status AS status_efetivo,
  r.expires_at
FROM public.agenda_reservas r
WHERE r.status = 'CONFIRMADO'
   OR (r.status = 'PENDENTE_PAGAMENTO' AND r.expires_at > now());

-- ----------------------------------------------------------------------------
-- 10. Validação de CPF e Resolução Segura de Morador (Sem Exposição de PII)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_cpf_valido(p_cpf_digitos text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_soma integer;
  v_resto integer;
  v_dv1 integer;
  v_dv2 integer;
  i integer;
BEGIN
  IF p_cpf_digitos IS NULL OR p_cpf_digitos !~ '^[0-9]{11}$' THEN
    RETURN false;
  END IF;

  -- Rejeita sequências repetidas (00000000000 .. 99999999999)
  IF p_cpf_digitos ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;

  v_soma := 0;
  FOR i IN 1..9 LOOP
    v_soma := v_soma + substr(p_cpf_digitos, i, 1)::integer * (11 - i);
  END LOOP;
  v_resto := 11 - (v_soma % 11);
  v_dv1 := CASE WHEN v_resto >= 10 THEN 0 ELSE v_resto END;

  IF v_dv1 <> substr(p_cpf_digitos, 10, 1)::integer THEN
    RETURN false;
  END IF;

  v_soma := 0;
  FOR i IN 1..10 LOOP
    v_soma := v_soma + substr(p_cpf_digitos, i, 1)::integer * (12 - i);
  END LOOP;
  v_resto := 11 - (v_soma % 11);
  v_dv2 := CASE WHEN v_resto >= 10 THEN 0 ELSE v_resto END;

  RETURN v_dv2 = substr(p_cpf_digitos, 11, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_validar_cpf_morador(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cpf_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  v_cpf_hash text;
  v_unidade_principal_id uuid;
  v_bloco smallint;
  v_apartamento smallint;
  v_quantidade integer := 0;
  v_identificacao_publica text;
  v_unidades jsonb;
BEGIN
  IF NOT public.agenda_cpf_valido(v_cpf_digitos) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CPF_INVALIDO',
      'message', 'CPF inválido. Verifique os 11 dígitos informados.'
    );
  END IF;

  -- Hash irreversível com prefixo de domínio (nunca expõe o CPF original)
  v_cpf_hash := encode(
    extensions.digest(convert_to('milano-agenda-v1:' || v_cpf_digitos, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT
    (array_agg(u.id ORDER BY u.bloco ASC, u.apartamento ASC))[1],
    (array_agg(u.bloco ORDER BY u.bloco ASC, u.apartamento ASC))[1],
    (array_agg(u.apartamento ORDER BY u.bloco ASC, u.apartamento ASC))[1],
    count(*)::integer,
    string_agg(
      format('Bloco %s - Apto %s', lpad(u.bloco::text, 2, '0'), u.apartamento::text),
      ' / '
      ORDER BY u.bloco ASC, u.apartamento ASC
    ),
    jsonb_agg(
      jsonb_build_object(
        'unidade_id', u.id,
        'bloco', u.bloco,
        'apartamento', u.apartamento,
        'label', format('Bloco %s - Apto %s', lpad(u.bloco::text, 2, '0'), u.apartamento::text)
      )
      ORDER BY u.bloco ASC, u.apartamento ASC
    )
  INTO
    v_unidade_principal_id,
    v_bloco,
    v_apartamento,
    v_quantidade,
    v_identificacao_publica,
    v_unidades
  FROM public.unidades_milano u
  WHERE COALESCE(btrim(u.cpf), '') <> ''
    AND regexp_replace(u.cpf, '\D', '', 'g') = v_cpf_digitos;

  IF v_quantidade = 0 OR v_unidade_principal_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CPF_NAO_ENCONTRADO',
      'message', 'CPF não localizado no cadastro oficial de moradores do condomínio.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'unidade_principal_id', v_unidade_principal_id,
    'bloco', v_bloco,
    'apartamento', v_apartamento,
    'quantidade_unidades', v_quantidade,
    'identificacao_publica', v_identificacao_publica,
    'titular_cpf_hash', v_cpf_hash,
    'unidades', v_unidades
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Funções de Autenticação Administrativa Isolada (agenda_admins)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_criar_admin(
  p_username text,
  p_nome_exibicao text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_username text := lower(btrim(COALESCE(p_username, '')));
  v_nome text := btrim(COALESCE(p_nome_exibicao, ''));
  v_admin_id uuid;
BEGIN
  IF v_username = '' OR v_username !~ '^[a-z0-9._@-]{3,64}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'USERNAME_INVALIDO',
      'message', 'Nome de usuário inválido (use 3 a 64 caracteres: letras minúsculas, números, ., _, @ ou -).'
    );
  END IF;

  IF v_nome = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOME_INVALIDO',
      'message', 'Nome de exibição é obrigatório.'
    );
  END IF;

  IF COALESCE(length(p_password), 0) < 8 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SENHA_FRACA',
      'message', 'A senha deve possuir no mínimo 8 caracteres.'
    );
  END IF;

  IF EXISTS (SELECT 1 FROM public.agenda_admins WHERE lower(btrim(username)) = v_username) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ADMIN_JA_EXISTE',
      'message', 'Já existe um administrador cadastrado com este usuário.'
    );
  END IF;

  INSERT INTO public.agenda_admins (username, nome_exibicao, password_hash, ativo)
  VALUES (
    v_username,
    v_nome,
    extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
    true
  )
  RETURNING id INTO v_admin_id;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_admin_id,
    'username', v_username,
    'nome_exibicao', v_nome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_autenticar_admin(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_username text := lower(btrim(COALESCE(p_username, '')));
  v_admin public.agenda_admins%ROWTYPE;
BEGIN
  IF v_username = '' OR COALESCE(p_password, '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CREDENCIAIS_INVALIDAS',
      'message', 'Usuário ou senha inválidos.'
    );
  END IF;

  SELECT *
  INTO v_admin
  FROM public.agenda_admins
  WHERE lower(btrim(username)) = v_username
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND OR v_admin.password_hash <> extensions.crypt(p_password, v_admin.password_hash) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CREDENCIAIS_INVALIDAS',
      'message', 'Usuário ou senha inválidos.'
    );
  END IF;

  UPDATE public.agenda_admins
  SET ultimo_login_em = now()
  WHERE id = v_admin.id;

  RETURN jsonb_build_object(
    'ok', true,
    'admin_id', v_admin.id,
    'username', v_admin.username,
    'nome_exibicao', v_admin.nome_exibicao
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_alterar_senha_admin(
  p_admin_id uuid,
  p_senha_atual text,
  p_nova_senha text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.agenda_admins%ROWTYPE;
BEGIN
  IF p_admin_id IS NULL OR COALESCE(p_senha_atual, '') = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CREDENCIAIS_INVALIDAS',
      'message', 'Senha atual obrigatória.'
    );
  END IF;

  IF COALESCE(length(p_nova_senha), 0) < 8 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SENHA_FRACA',
      'message', 'A nova senha deve possuir no mínimo 8 caracteres.'
    );
  END IF;

  IF p_nova_senha = p_senha_atual THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SENHA_IGUAL',
      'message', 'A nova senha deve ser diferente da senha atual.'
    );
  END IF;

  SELECT *
  INTO v_admin
  FROM public.agenda_admins
  WHERE id = p_admin_id
    AND ativo = true
  LIMIT 1;

  IF NOT FOUND OR v_admin.password_hash <> extensions.crypt(p_senha_atual, v_admin.password_hash) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SENHA_ATUAL_INCORRETA',
      'message', 'Senha atual incorreta.'
    );
  END IF;

  UPDATE public.agenda_admins
  SET password_hash = extensions.crypt(p_nova_senha, extensions.gen_salt('bf', 12))
  WHERE id = v_admin.id;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Senha alterada com sucesso.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. Segurança, RLS e Revogação de Privilégios Públicos (LGPD Defense-in-Depth)
-- ----------------------------------------------------------------------------
ALTER TABLE public.agenda_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_espacos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_feriados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_recibos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.agenda_config,
  public.agenda_admins,
  public.agenda_espacos,
  public.agenda_feriados,
  public.agenda_reservas,
  public.agenda_recibos,
  public.agenda_reservas_publicas
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.agenda_config,
  public.agenda_admins,
  public.agenda_espacos,
  public.agenda_feriados,
  public.agenda_reservas,
  public.agenda_recibos
TO service_role;

GRANT SELECT ON TABLE public.agenda_reservas_publicas TO service_role;

DROP POLICY IF EXISTS "agenda_config_service_role" ON public.agenda_config;
CREATE POLICY "agenda_config_service_role"
  ON public.agenda_config FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_admins_service_role" ON public.agenda_admins;
CREATE POLICY "agenda_admins_service_role"
  ON public.agenda_admins FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_espacos_service_role" ON public.agenda_espacos;
CREATE POLICY "agenda_espacos_service_role"
  ON public.agenda_espacos FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_feriados_service_role" ON public.agenda_feriados;
CREATE POLICY "agenda_feriados_service_role"
  ON public.agenda_feriados FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_reservas_service_role" ON public.agenda_reservas;
CREATE POLICY "agenda_reservas_service_role"
  ON public.agenda_reservas FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "agenda_recibos_service_role" ON public.agenda_recibos;
CREATE POLICY "agenda_recibos_service_role"
  ON public.agenda_recibos FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION
  public.agenda_set_updated_at(),
  public.agenda_recibos_imutavel(),
  public.agenda_cpf_valido(text),
  public.agenda_validar_cpf_morador(text),
  public.agenda_criar_admin(text, text, text),
  public.agenda_autenticar_admin(text, text),
  public.agenda_alterar_senha_admin(uuid, text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.agenda_validar_cpf_morador(text),
  public.agenda_criar_admin(text, text, text),
  public.agenda_autenticar_admin(text, text),
  public.agenda_alterar_senha_admin(uuid, text, text)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
