# AGENTS.md — Sistema Web de Agendamento de Áreas Comuns (`agenda.portalmilano.com`)

> **Condomínio:** Milano Condomínio Club  
> **Domínio de Produção:** `https://agenda.portalmilano.com`  
> **Repositório Oficial:** `https://github.com/mattosleandro/AgendaMilano.git`  
> **Escopo:** Diretrizes arquiteturais, operacionais, visuais, de segurança (LGPD) e de integração obrigatórias para qualquer agente ou engenheiro atuando neste repositório.

---

## 1. Diretriz Operacional Obrigatória: Método GCCD

Todo planejamento, tomada de decisão técnica, criação ou edição de arquivos, migração SQL, Pull Request, commit e entrega de fase neste repositório **DEVE** ser estruturado e validado pelo método **GCCD**:

- **G — Goal (Objetivo):** Declarar explicitamente qual resultado concreto a tarefa entrega e qual problema real de agendamento, justiça de acesso ou controle financeiro do condomínio ela resolve.
- **C — Context (Contexto):** Ancorar a solução na arquitetura real (Next.js App Router + Supabase autohospedado existente e higienizado na VPS + identidade visual de `./imagens` + infraestrutura Coolify/Cloudflare Tunnel) e nas regras de negócio condominiais.
- **C — Constraints (Restrições):** Respeitar limites técnicos e inegociáveis: performance mobile em redes 4G/5G, prevenção de reserva dupla (*race conditions*) e limite de 1 reserva por CPF na mesma data em nível de banco de dados, sigilo jurídico absoluto (LGPD), preservação integral das 12 tabelas ativas do Supabase, compatibilidade `linux/arm64` na VPS e zero exposição de segredos no cliente.
- **D — Done When (Critérios de Conclusão):** Definir condições observáveis, testáveis e verificáveis para considerar a entrega pronta: **zero `// TODO` ou placeholders**, **zero mocks estáticos em produção**, build limpo (`next build` + `tsc --noEmit`), travas de banco validadas e verificação de ausência de vazamento de PII.

**Regra de Ouro:** Nenhuma alteração de código ou schema deve ser executada sem antes validar o alinhamento com os quatro pilares do GCCD e com a fase vigente em [`PLAN.md`](./PLAN.md).

---

## 2. Infraestrutura Real da VPS e Stack Definida

*Dados auditados e higienizados na VPS (`antigravity` / host `myoraclecloud`).*

### 2.1 Stack da Aplicação
- **Framework:** Next.js (App Router, TypeScript strict, Server Components, Server Actions e Route Handlers), compilado com `output: 'standalone'`.
- **Estilização:** Tailwind CSS com tokens CSS derivados da identidade visual oficial (`./imagens`), abordagem **Mobile-First**.
- **Banco de Dados:** Supabase autohospedado existente na VPS (`supabase-db`: **PostgreSQL 17.6** em `aarch64-unknown-linux-gnu`).
- **Gateway/API Supabase:**
  - **Uso interno server-side (obrigatório para backend Next.js):** `SUPABASE_INTERNAL_URL=http://supabase-envoy:8000` (tráfego direto na rede Docker `milano_net`, sem volta na internet pública).
  - **Endpoint público de referência:** `NEXT_PUBLIC_SUPABASE_URL=https://api.portalmilano.com`.
  - **PostgREST (`supabase-rest`):** `PGRST_DB_SCHEMAS=public,graphql_public` (`PGRST_DB_ANON_ROLE=anon`).
- **Repositório e Deploy:** GitHub (`https://github.com/mattosleandro/AgendaMilano.git`) com build e deploy automatizados via **Coolify v4.7.5** (projeto `portal-milano` na VPS).
- **Exposição Pública e TLS:** **Cloudflare Tunnel** (`cloudflared_milano`, imagem `cloudflare/cloudflared:2026.10.2`, túnel gerenciado remotamente via `TUNNEL_TOKEN` no Cloudflare Zero Trust Dashboard) roteando `agenda.portalmilano.com` diretamente pela rede Docker `milano_net`.

### 2.2 Topologia de Rede Docker e Arquitetura de Hardware
- **Arquitetura da VPS:** **`aarch64` (ARM64)** — Ubuntu 24.04. Todas as imagens Docker e dependências nativas **DEVEM** ser compatíveis com `linux/arm64`.
- **Rede compartilhada de produção:** `milano_net` (`172.24.5.0/24`), onde residem atualmente:
  - `cloudflared_milano` (`172.24.5.3`)
  - `supabase-envoy` (`172.24.5.4`)
  - `moradores_milano` (`172.24.5.5` — aliases: `moradores_milano`, `moradores-milano`)
  - `votar_milano` (`172.24.5.6` — aliases: `votar_milano`, `votar-milano-web`)
  - *(Nota: o container órfão legado `portal_milano` e suas 15 tabelas protótipo em inglês foram removidos com backup prévio em `/home/ubuntu/backups/`).*
- **Convenção obrigatória de deploy no Coolify:** O container do sistema de agenda **DEVE** ser conectado à rede externa `milano_net` com **alias estável** (`agenda-milano-web` e `agenda_milano`) na porta interna `3000` (`HOSTNAME=0.0.0.0`), para que o Cloudflare Tunnel aponte para `http://agenda-milano-web:3000` sem quebrar a cada novo deploy com sufixo de timestamp do Coolify.

### 2.3 Fuso Horário Oficial e Extensões do Banco
- **Fuso horário do SO da VPS e do `supabase-db`:** `UTC`.
- **Fuso horário oficial confirmado do condomínio:** **`America/Campo_Grande` (UTC-4 — Mato Grosso do Sul)**.
  - Todo timestamp armazenado no PostgreSQL **DEVE** usar `timestamptz` (UTC).
  - Toda regra de calendário, dia da semana para precificação e abertura mensal (**dia 25 às 20:00:00**) **DEVE** ser avaliada no fuso `America/Campo_Grande`, usando o relógio do servidor/PostgreSQL (`now()`) como fonte autoritativa única.
- **Extensões instaladas e pré-carregadas (`shared_preload_libraries`):**
  - Instaladas: `pgcrypto` (1.3), `uuid-ossp` (1.1), `pg_net` (0.20.3), `pg_stat_statements` (1.11), `supabase_vault` (0.3.1).
  - Pré-carregada com scheduler ativo: `pg_cron` (1.6.4), pronta para `CREATE EXTENSION IF NOT EXISTS pg_cron;`.

---

## 3. Estado Higienizado do Banco e Mapeamento de `public.unidades_milano`

### 3.1 Inventário Atual de Tabelas em `public` (Pós-Higienização)
Após backup completo e remoção das 15 tabelas legadas em inglês do antigo protótipo `portal_milano`, o schema `public` contém exatamente **12 tabelas ativas**, todas com **RLS habilitado (`rls = true`)**:

1. **Ecossistema Base de Moradores & WhatsApp (5 tabelas — INTACTAS):**
   - `public.unidades_milano` (544 linhas — **Base Oficial Mestre de Moradores**)
   - `public.participantes_grupo_wa` (447 linhas)
   - `public.campanha_convite_wa` (239 linhas — RLS restrito a `authenticated, service_role`)
   - `public.campanha_convite_wa_logs` (115 linhas — RLS restrito a `authenticated, service_role`)
   - `public.disparos_wa_convite` (535 linhas — RLS habilitado e restrito a `authenticated, service_role`)
2. **Ecossistema de Assembleia `votar_milano` (7 tabelas — INTACTAS):**
   - `public.assembleia_config`, `public.assembleia_unidades`, `public.assembleia_pautas`, `public.assembleia_votos`, `public.assembleia_presencas`, `public.assembleia_inadimplentes`, `public.assembleia_historico`.

**REGRAS INEGOCIÁVEIS DE PRESERVAÇÃO E ISOLAMENTO:**
1. **É PROIBIDO** alterar, renomear, remover colunas, modificar triggers, mudar políticas RLS ou gravar dados nas 12 tabelas existentes acima.
2. **Isolamento por namespace de prefixo:** Todas as tabelas, views, enums, índices e funções do novo sistema no schema `public` **DEVEM** usar obrigatoriamente o prefixo **`agenda_`** (`agenda_config`, `agenda_admins`, `agenda_espacos`, `agenda_feriados`, `agenda_reservas`, `agenda_recibos`, `agenda_reservas_publicas`, etc.).

### 3.2 Schema Exato de `public.unidades_milano` (Fonte Oficial de Moradores)
Auditado em modo somente leitura: **544 registros** (34 blocos × 16 apartamentos por bloco).

| Coluna | Tipo PostgreSQL | Nulo? | Uso na Agenda | Observações Auditadas |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `uuid` (PK) | NÃO | Referência FK (`unidade_id`) | Identificador imutável da unidade |
| `bloco` | `smallint` | NÃO | **Exibido publicamente** | `CHECK (bloco >= 1 AND bloco <= 34)` (34 blocos) |
| `apartamento` | `smallint` | NÃO | **Exibido publicamente** | `CHECK (apartamento IN (101..104, 201..204, 301..304, 401..404))` |
| `andar` | `smallint` | SIM | Não exibido | Metadado estrutural |
| `posicao` | `smallint` | SIM | Não exibido | Metadado estrutural |
| `fase` | `smallint` | NÃO | Não exibido | `CHECK (fase IN (1, 2))` |
| `modulo` | `smallint` | NÃO | Não exibido | `CHECK (modulo IN (1, 2, 3, 4))` |
| `cpf` | `character varying` | SIM | **Validação server-side ONLY** | **537 preenchidos no formato `000.000.000-00` (14 chars / 11 dígitos); 7 unidades vagas sem CPF** |
| `nome_cliente` | `text` | SIM | **SIGILO ABSOLUTO (LGPD)** | Nunca expor em rotas públicas, agenda ou payload do cliente |
| `rg`, `orgao_rg` | `character varying` | SIM | **PROIBIDO LER** | Não utilizado pelo sistema de agenda |
| `email` | `text` | SIM | **SIGILO ABSOLUTO (LGPD)** | Nunca expor em rotas públicas, agenda ou payload do cliente |
| `telefone_1`, `telefone_2`, `phone_key_1`, `phone_key_2`, `telefone_validador` | `character varying` | SIM | **SIGILO ABSOLUTO (LGPD)** | Nunca expor em rotas públicas, agenda ou payload do cliente |
| `no_grupo`, `possui_cadastro`, `observacoes`, `created_at`, `updated_at` | `bool` / `text` / `timestamptz` | - | Não exibidos | Metadados internos da base oficial |

### 3.3 Regras Obrigatórias de Validação de CPF, CPF com 2 Apartamentos e Preparação para Inquilinos
1. **Formato do CPF na Base (`XXX.XXX.XXX-XX`) e Unidades Vagas:**
   - Todos os 537 CPFs cadastrados estão armazenados com pontuação (14 caracteres).
   - As **7 unidades vagas sem CPF** (`07/402`, `08/403`, `09/102`, `14/403`, `14/404`, `18/403`, `30/102`) possuem `cpf` nulo/vazio e `possui_cadastro = false`.
   - A função `public.agenda_validar_cpf_morador(p_cpf)` **DEVE** limpar caracteres não numéricos, exigir exatamente 11 dígitos válidos (módulo 11), rejeitar strings vazias e comparar `regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf_digitos` exclusivamente via `service_role`.
2. **Regra do CPF Proprietário de 2 Apartamentos (`Bloco 20 - Apto 402` e `Bloco 28 - Apto 404`):**
   - Na base atual, 535 CPFs possuem 1 unidade e **1 CPF possui 2 unidades (`Bloco 20 - Apto 402` e `Bloco 28 - Apto 404`)**.
   - **A reserva é vinculada ao titular (CPF) e não permite agir como dois apartamentos separados:**
     - Quando um CPF possui 1 unidade, sua identificação pública é `Bloco X - Apto Y`.
     - Quando um CPF possui 2 unidades (`20/402` e `28/404`), o sistema unifica a sessão sob uma única identidade pública: **`Bloco 20 - Apto 402 / Bloco 28 - Apto 404`** (2 apartamentos / 1 única identidade de reserva), referenciando a primeira unidade ordenada como `unidade_id` principal e gravando `identificacao_publica` e `titular_cpf_hash` (SHA-256) na reserva.
   - **Limite por Data e por CPF:** Cada CPF (`titular_cpf_hash`) pode ter **no máximo 1 reserva ativa (`PENDENTE_PAGAMENTO` ou `CONFIRMADO`) na mesma data (`data_reserva`)**. Assim, quem possui 2 apartamentos no mesmo CPF só pode fazer **1 única reserva por data**, exatamente como quem possui 1 apartamento.
   - **Evolução Futura para Inquilinos/Locatários:** Como toda a resolução de CPF fica encapsulada na função SQL `public.agenda_validar_cpf_morador(p_cpf)`, assim que o CPF do inquilino for atualizado na unidade alugada (ou adicionado em coluna de locatário futuro), os dois apartamentos passam automaticamente a operar de forma independente sem alterar o frontend.
3. **Autenticação Exclusiva do Painel do Síndico (`/admin`):**
   - Utilizar tabela própria e isolada **`public.agenda_admins`** (com hash bcrypt via `pgcrypto` `crypt(..., gen_salt('bf', 12))` e sessão assinada em cookie `HttpOnly`, `Secure`, `SameSite=Lax`), totalmente independente de tabelas externas, com opção de troca de senha no próprio painel.
   - **PROIBIDO** armazenar senha, PIN ou chave administrativa em variáveis `NEXT_PUBLIC_*`.

---

## 4. Regras de Negócio Condominiais (Fonte Canônica)

### 4.1 Espaços Disponíveis
1. **Salão de Festas (`salao-de-festas`):**
   - Capacidade máxima: **100 pessoas**.
   - **Regra obrigatória de UX e banco:** Exibir aviso explícito de capacidade máxima de 100 pessoas e exigir checkbox de aceite explícito no ato da reserva, persistindo `aceite_capacidade = true` e `aceite_capacidade_em` no banco.
2. **Quiosque 1 (`quiosque-1`):**
   - Localização obrigatória na interface e no recibo: **Em frente à quadra esportiva**.
3. **Quiosque 2 (`quiosque-2`):**
   - Localização obrigatória na interface e no recibo: **Em frente à quadra de areia**.

### 4.2 Abertura de Lote Mensal e Cota
- **Abertura Mensal Fixa:** Todo **dia 25, exatamente às 20:00:00** (`America/Campo_Grande`), liberando integralmente todas as datas do **mês subsequente**.
- **Regra matemática canônica:** Para qualquer data alvo `D`, o instante de abertura do lote é o dia 25 às 20:00:00 (horário local `America/Campo_Grande`) do mês imediatamente anterior a `D`:
  $$\text{abertura}(D) = \text{Dia } 25 \text{ às } 20\text{h}00\text{ do mês anterior a } D \text{ (America/Campo\_Grande)}$$
  Uma data `D` só pode ser reservada se `D >= hoje_local` **e** `now() >= abertura(D)`.
- **Antes das 20:00 do dia 25:** O mês seguinte permanece visualmente bloqueado para clique, exibindo um **contador regressivo sincronizado com o relógio do servidor** (`serverNow`).
- **Cota Mensal vs. Limite por Data:**
  - **Sem limite mensal de cota:** Um morador pode agendar múltiplas datas diferentes ao longo do mesmo mês, desde que disponíveis e com pagamentos cumpridos.
  - **Limite estrito de 1 reserva por data por CPF:** Um mesmo CPF (`titular_cpf_hash`) pode ter **no máximo 1 reserva ativa (`PENDENTE_PAGAMENTO` ou `CONFIRMADO`) na mesma data (`data_reserva`)**, independentemente de possuir 1 ou 2 apartamentos.

### 4.3 Motor de Precificação Dinâmica e Feriados
Valores armazenados em **centavos (`integer`)** para evitar erros de ponto flutuante:

| Espaço | Segunda a Quinta (não feriado) | Sexta-feira (não feriado) | Sábado, Domingo e Feriados |
| :--- | :---: | :---: | :---: |
| **Salão de Festas** | R$ 140,00 (`14000`) | R$ 180,00 (`18000`) | R$ 220,00 (`22000`) |
| **Quiosque 1** (Quadra esportiva) | R$ 70,00 (`7000`) | R$ 90,00 (`9000`) | R$ 90,00 (`9000`) |
| **Quiosque 2** (Quadra de areia) | R$ 70,00 (`7000`) | R$ 90,00 (`9000`) | R$ 90,00 (`9000`) |

- **Véspera de feriado:** **NÃO** altera o valor — aplica-se rigorosamente a tarifa do dia da semana normal.
- **Feriados Automáticos:** Integração server-side com a BrasilAPI (`https://brasilapi.com.br/api/feriados/v1/{ano}`), persistida em cache na tabela `agenda_feriados`.
- **Feriados Locais:** O Painel do Síndico permite cadastrar, editar e ativar/desativar feriados estaduais (MS) e municipais (Campo Grande) na mesma tabela `agenda_feriados`.
- **Snapshot Financeiro:** O preço calculado no ato da reserva é gravado de forma imutável na reserva (`valor_centavos`, `regra_tarifa`), garantindo fidelidade do recibo mesmo após reajustes futuros.

### 4.4 Pagamento em Espécie, Expiração em 48h e Recibo Auditável
- **Forma de pagamento:** Exclusivamente **dinheiro vivo entregue diretamente ao síndico**.
- **Ciclo de vida dos status (`agenda_reserva_status`):**
  - `PENDENTE_PAGAMENTO`: Estado inicial ao reservar. Prazo fixo de **`expires_at = created_at + interval '48 hours'`**.
  - `CONFIRMADO`: Atribuído exclusivamente pelo síndico no painel após recebimento do dinheiro, dentro da janela válida (`expires_at > now()`), gerando atomicamente um **Recibo Digital Auditável** (`agenda_recibos`).
  - `EXPIRADO`: Atribuído automaticamente quando `now() >= expires_at` sem confirmação. A data volta a ficar livre **imediatamente**.
  - `CANCELADO`: Cancelamento manual registrado com motivo e auditoria pelo síndico.
- **Recibo Digital Auditável:** Gerado na mesma transação da confirmação do pagamento, contendo código legível único (`MIL-2026-XXXXXX`), hash criptográfico SHA-256 imutável dos dados da transação, data/hora da baixa (`confirmado_em`), identificação da unidade (`Bloco X - Apto Y` ou `Bloco 20 - Apto 402 / Bloco 28 - Apto 404`), espaço (com localização/capacidade), data da reserva e valor pago em espécie.

---

## 5. Regras Inegociáveis de LGPD e Controle de Concorrência

### 5.1 Sigilo Jurídico Absoluto (LGPD)
1. **Visibilidade Pública Estrita:** A agenda pública, rotas `/api/agenda/*`, payloads JSON RSC/API, HTML SSR, logs de cliente e tela do calendário **DEVEM** exibir **APENAS**:
   - `bloco`, `apartamento` e `identificacao_publica` (ex: `Bloco X - Apto Y` ou `Bloco 20 - Apto 402 / Bloco 28 - Apto 404`);
   - `status` (`Aguardando Pagamento` ou `Confirmado`);
   - Metadados não pessoais da reserva (espaço, data, prazo de expiração se pendente).
2. **Proibição Absoluta de PII:** É **estritamente proibido** retornar, serializar ou renderizar `nome_cliente`, `cpf` (em texto claro), `rg`, `telefone_1`, `telefone_2` ou `email` em:
   - Qualquer rota pública (`GET /api/agenda`, SSR da página inicial, calendário);
   - Cookies de sessão do morador (o cookie `HttpOnly` assinado carrega apenas `{ unidade_id, bloco, apartamento, identificacao_publica, titular_cpf_hash, exp }`);
   - Recibo público verificável por link/código (`/recibo/[codigo]`).
3. **Banco e RLS:**
   - Todas as tabelas `agenda_*` terão **RLS ativado** bloqueando acesso direto de `anon`.
   - Leituras públicas da agenda usam projeção dedicada (`agenda_reservas_publicas`) sem `JOIN` com `public.unidades_milano` e sem expor `titular_cpf_hash`.
4. **Logs sem PII:** Nunca registrar CPF completo, nome, telefone ou e-mail em `console.log`, logs de erro ou telemetria.

### 5.2 Prevenção de Reserva Dupla (*Race Conditions*), Limite de 1 Reserva/Data por CPF e Expiração Instantânea
No dia 25 às 20:00, dezenas de moradores podem clicar simultaneamente na mesma data. O sistema **DEVE** garantir atomicidade no PostgreSQL com **duas travas físicas (Partial Unique Indexes)**:

1. **Trava física 1 — Proibição de Reserva Dupla no Mesmo Espaço e Data:**
   ```sql
   CREATE UNIQUE INDEX uq_agenda_reservas_espaco_data_ativa
     ON public.agenda_reservas (espaco_id, data_reserva)
     WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO');
   ```
2. **Trava física 2 — Máximo de 1 Reserva Ativa na Mesma Data por CPF (mesmo para CPF com 2 apartamentos):**
   ```sql
   CREATE UNIQUE INDEX uq_agenda_reservas_titular_data_ativa
     ON public.agenda_reservas (titular_cpf_hash, data_reserva)
     WHERE status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO');
   ```
3. **Transação atômica via RPC (`agenda_criar_reserva`):**
   - Valida no banco se `data_reserva >= hoje_local` e `now() >= abertura_lote(data_reserva)` (impedindo bypass de relógio do navegador).
   - Adquire locks transacionais (`pg_advisory_xact_lock`) para `(espaco_id, data_reserva)` e `(titular_cpf_hash, data_reserva)`.
   - **Expiração lógica imediata (*lazy expiration*):** Antes do `INSERT`, atualiza para `EXPIRADO` qualquer registro `PENDENTE_PAGAMENTO` vencido (`expires_at <= now()`) naquela data — eliminando qualquer janela fantasma entre execuções do cron.
   - Executa o `INSERT` protegido pelos dois índices únicos parciais; colisões retornam erro controlado `409 Conflict` com mensagem clara em português (diferenciando se o espaço já foi reservado por outro morador ou se o próprio CPF já possui uma reserva ativa naquela data).
4. **Expiração proativa em segundo plano (`pg_cron`):**
   - Job `pg_cron` executando a cada 1 minuto no `supabase-db` para varrer e atualizar `PENDENTE_PAGAMENTO` vencidos para `EXPIRADO`.
5. **Leitura sempre consistente:** Toda consulta de disponibilidade trata `status = 'PENDENTE_PAGAMENTO' AND expires_at <= now()` como livre/expirado em tempo real, garantindo liberação no milissegundo exato da 48ª hora.

---

## 6. Guia de Estilo Visual e Identidade (`./imagens`)

*Extraído diretamente dos ativos vetoriais e raster em `./imagens`.*

### 6.1 Inventário de Ativos em `./imagens`
| Arquivo | Dimensões / `viewBox` | Proporção | Cores Extraídas | Uso Recomendado |
| :--- | :--- | :---: | :--- | :--- |
| `Logo.svg` | `viewBox="0 0 126 122.09"` | `1.03 : 1` | `#CCB285` | Favicon, ícone PWA, header compacto mobile (< 360px), marca d'água no Recibo Digital |
| `LogoEscrita.svg` | `viewBox="0 0 473.48 122.09"` | `3.88 : 1` | `#CCB285` (símbolo) + `#0C0C0D` (texto) | Header claro, tela de identificação, cabeçalho do Recibo Digital |
| `LogoComEscritaBrancaMilano.webp` | `218 × 123 px` | `1.77 : 1` | `#CCB285` (símbolo) + `#FFFFFF` (texto) | Referência para header escuro (`#0C0C0D`) — renderizar preferencialmente como componente SVG inline nítido usando os paths de `LogoEscrita.svg` com `fill="#FFFFFF"` no texto |
| `LogoComEscritaMilano.webp` | `218 × 123 px` | `1.77 : 1` | `#CCB285` + `#0C0C0D` | Fallback raster / OpenGraph |
| `ApenasLogoMilano.webp` | `127 × 123 px` | `1.03 : 1` | `#CCB285` | Fallback raster do ícone |
| `Prancheta 1.png` | `127 × 123 px` | `1.03 : 1` | `#CCB385` | Referência raster PNG para ícone/apple-touch-icon |

> **Regra de preservação:** Manter `./imagens` intocada como pasta de referência original; na Fase 3, copiar/otimizar os ativos necessários para `public/brand/`.

### 6.2 Paleta de Cores e Tokens CSS / Tailwind
A marca **Milano Condomínio Club** combina **Dourado Champagne (`#CCB285`)** e **Obsidian (`#0C0C0D`)** com estética arquitetônica sóbria e contemporânea. Como `#CCB285` sobre branco não atinge contraste WCAG AA para texto pequeno, utiliza-se uma rampa tonal acessível fiel ao tom original:

```css
:root {
  /* Marca Oficial (extraída de ./imagens) */
  --milano-gold: #CCB285;        /* Cor oficial do símbolo M (ícones, bordas, acentos em dark) */
  --milano-gold-50: #FAF7F1;     /* Fundo suave para cards de destaque e dia selecionado */
  --milano-gold-100: #F3EBDC;    /* Hover sutil e pills secundários */
  --milano-gold-200: #E5D5B8;    /* Bordas douradas suaves */
  --milano-gold-600: #9A7D4A;    /* Elementos gráficos / ícones sobre fundo claro */
  --milano-gold-700: #7D6335;    /* Texto dourado acessível sobre branco (WCAG AA > 5.3:1) */

  /* Neutros e Superfícies (Light-First de alto contraste sob luz solar) */
  --milano-ink: #0C0C0D;         /* Cor oficial da tipografia MILANO (headers, CTA primário) */
  --milano-ink-soft: #1E1E22;    /* Superfícies escuras elevadas (header / admin) */
  --milano-bg: #F8F7F4;          /* Fundo principal off-white quente */
  --milano-surface: #FFFFFF;     /* Cards, calendário, modais e recibo */
  --milano-border: #E7E2D8;      /* Divisores e bordas sutis */
  --milano-text: #18181B;        /* Texto principal */
  --milano-text-muted: #52525B;  /* Texto secundário / legendas */

  /* Semântica da Agenda (sempre acompanhada de ícone + texto) */
  --status-free-bg: #FFFFFF;
  --status-free-accent: #15803D;
  --status-pending-bg: #FFFBEB;
  --status-pending-border: #F59E0B;
  --status-pending-text: #92400E;
  --status-confirmed-bg: #F0FDF4;
  --status-confirmed-border: #15803D;
  --status-confirmed-text: #166534;
  --status-locked-bg: #F4F4F5;
  --status-locked-text: #71717A;
  --status-danger-bg: #FEF2F2;
  --status-danger-text: #B91C1C;
}
```

### 6.3 Tipografia e Diretrizes Mobile-First (4G/5G)
- **Fonte Primária (Títulos e UI):** `Plus Jakarta Sans` (pesos `500`, `600`, `700`) via `next/font/google` (`display: 'swap'`, subset `latin`) — geometria limpa alinhada ao wordmark `MILANO`.
- **Fonte Auxiliar / Números Tabulares:** `Inter` (ou `Plus Jakarta Sans`) com **`font-variant-numeric: tabular-nums`** (`tabular-nums` no Tailwind) **obrigatório** em:
  - Grade de dias do calendário;
  - Contador regressivo do dia 25 às 20:00 e prazo restante de 48h;
  - Valores monetários (`R$ 140,00`, `R$ 180,00`, `R$ 220,00`, `R$ 70,00`, `R$ 90,00`);
  - Identificação de unidade (`Bloco 01 - Apto 101` ou `Bloco 20 - Apto 402 / Bloco 28 - Apto 404`).
- **Fonte Monospace (Recibo Digital):** `JetBrains Mono` (ou stack mono do sistema) para código de recibo e hash SHA-256.
- **Ergonomia e Performance Mobile:**
  - Alvos de toque mínimos de **44×44 px** nas células do calendário, abas de espaços e botões de ação.
  - Navegação de espaços em abas segmentadas (*segmented control*) fixas no topo para alternância instantânea entre **Salão de Festas**, **Quiosque 1** e **Quiosque 2**.
  - Payload mínimo para redes móveis 4G/5G: Server Components por padrão, zero bibliotecas pesadas de calendário quando uma grade mensal leve customizada resolve com < 5 KB JS, imagens em SVG/WebP e feedback otimista/loading skeleton instantâneo.

---

## 7. Padrões de Qualidade e Critérios de Aceitação Contínua

Antes de encerrar qualquer tarefa ou fase, o agente **DEVE** verificar:
1. **Zero dívida técnica oculta:** Nenhum `// TODO`, `// FIXME`, `console.log` de depuração ou dado mockado em rotas de produção.
2. **Tipagem e Build:** `npx tsc --noEmit` e `npm run build` concluídos sem erros nem avisos críticos.
3. **Auditoria LGPD:** Inspecionar respostas reais das rotas públicas (`curl` / testes automatizados) comprovando ausência total de `nome`, `cpf`, `email`, `telefone`, `rg`.
4. **Integridade do Banco:** Nenhuma alteração nas 12 tabelas pré-existentes do Supabase; todas as migrações SQL são idempotentes (`IF NOT EXISTS` / `CREATE OR REPLACE`) e versionadas em `supabase/migrations/`.
5. **Segurança:** Nenhum segredo (`SUPABASE_SERVICE_ROLE_KEY`, senhas, tokens) exposto no bundle do cliente ou versionado em `.git`.
