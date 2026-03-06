# RELATÓRIO DE AUDITORIA — boot-whats

**Projeto:** WhatsApp Gateway API  
**Stack:** Node.js 20 + Express 5 + PostgreSQL + Redis/BullMQ + Baileys  
**Data da Auditoria:** 06/03/2026  
**Auditor:** GitHub Copilot (Claude Opus 4.6)

---

## ÍNDICE

1. [Resumo Executivo](#1-resumo-executivo)
2. [Vulnerabilidades de Segurança](#2-vulnerabilidades-de-segurança)
3. [Arquitetura e Design](#3-arquitetura-e-design)
4. [Clean Code e Boas Práticas](#4-clean-code-e-boas-práticas)
5. [POO e Padrões de Projeto](#5-poo-e-padrões-de-projeto)
6. [Testes e Cobertura](#6-testes-e-cobertura)
7. [Performance e Escalabilidade](#7-performance-e-escalabilidade)
8. [Infraestrutura e DevOps](#8-infraestrutura-e-devops)
9. [Banco de Dados](#9-banco-de-dados)
10. [Plano de Ação Priorizado](#10-plano-de-ação-priorizado)

---

## 1. RESUMO EXECUTIVO

### Nota Geral: 7.5 / 10

O projeto apresenta uma arquitetura bem organizada com boas práticas de segurança aplicadas (SSRF protection, timing-safe auth, parameterized queries, rate limiting). A separação de responsabilidades entre controllers, services, e utilities está correta. No entanto, existem **vulnerabilidades críticas** que precisam de atenção imediata, especialmente relacionadas a credenciais expostas e configurações de segurança insuficientes.

| Categoria | Nota | Veredicto |
|---|---|---|
| **Segurança** | 6/10 | Credenciais expostas + API_KEY fraca |
| **Arquitetura** | 8/10 | Bem estruturado, separação clara |
| **Clean Code** | 8/10 | Código limpo e legível |
| **POO** | 7/10 | Bom uso de classes, pode melhorar |
| **Testes** | 7/10 | Boa cobertura básica, faltam edge cases |
| **Performance** | 7/10 | Adequado, com pontos de melhoria |
| **Infraestrutura** | 8/10 | Docker, PM2, Railway bem configurados |
| **Banco de Dados** | 7.5/10 | Esquema correto, faltam migrations |

---

## 2. VULNERABILIDADES DE SEGURANÇA

### CRÍTICO (P0 — Resolver IMEDIATAMENTE)

#### 2.1 🔴 Credenciais Reais no `.env`

**Arquivo:** `.env`  
**Risco:** OWASP A07 — Identification and Authentication Failures

```
API_KEY=23021996
DATABASE_URL=postgresql://postgres.kakyfwettkjjijklrmqc:yh2YV9Dzndwg2ZJj@aws-0-us-west-2.pooler.supabase.com:6543/postgres
SUPABASE_KEY=sb_publishable_rRDBDQoyuH6SFNE1vYaFLg_2rcyrFV0
```

**Problemas:**
1. **API_KEY `23021996`** — É um número de 8 dígitos (parece uma data de nascimento). Extremamente fraco, vulnerável a brute force. Deveria ser no mínimo 32 caracteres aleatórios.
2. **DATABASE_URL com credenciais reais** em texto plano — mesmo com `.gitignore`, se esse arquivo já foi commitado anteriormente, as credenciais estão no histórico do Git.
3. **SUPABASE_KEY exposta** — Chave do Supabase em texto plano.

**Correção:**
```bash
# Gere uma API_KEY forte:
openssl rand -hex 32

# Rotacione TODAS as credenciais imediatamente:
# 1. Troque a senha do Supabase/Postgres
# 2. Gere nova API_KEY
# 3. Regenere o SUPABASE_KEY
# 4. Verifique se .env já foi commitado: git log --all -- .env
```

#### 2.2 🔴 Ausência de Validação de Tamanho do Body JSON

**Arquivo:** `src/server.js` (linha ~64)

```js
app.use(express.json({ limit: "1mb" }));
```

O limite de 1MB é razoável, porém **não há proteção contra JSON Depth Attack** (JSONs profundamente aninhados que consomem CPU no parsing). Considere adicionar um middleware que limite a profundidade.

---

### ALTO (P1 — Resolver esta semana)

#### 2.3 🟠 Webhook URL Sem Validação SSRF

**Arquivo:** `src/utils/webhook.js`

A `webhookUrl` é lida diretamente do config e usada com `fetch()` sem validação alguma. Se um administrador configurar uma URL maliciosa (apontando para rede interna), há risco de SSRF.

```js
// Webhook faz fetch sem validar se a URL aponta para IP privado
const resp = await fetch(webhookUrl, { ... });
```

**Correção:** Aplicar a mesma validação `validateMediaUrlDns()` na URL do webhook no boot da aplicação.

#### 2.4 🟠 `process.exit(0)` no Shutdown

**Arquivo:** `src/server.js` (linha ~100)

```js
async function shutdown(signal) {
    // ... cleanup ...
    process.exit(0);  // Força exit sem esperar pendências
}
```

Se houver jobs BullMQ em processamento durante o shutdown, eles serão interrompidos abruptamente. O `process.exit(0)` deveria ter um timeout de segurança e aguardar jobs em andamento.

#### 2.5 🟠 Rate Limiter por API Key Compartilhada

**Arquivo:** `src/server.js`

```js
keyGenerator: (req) => req.headers["x-api-key"] || req.ip,
```

Se todos os clientes usam a **mesma API_KEY** (cenário atual — só há uma key), o rate limit é compartilhado entre todos. Um cliente legítimo pode ser bloqueado por conta de outro.

#### 2.6 🟠 Mensagens Recebidas Sem Autenticação

**Arquivo:** `src/routes/index.js`

O endpoint `/messages` **usa auth** (está na tabela API_ROUTES), porém as mensagens armazenadas no `RingBuffer` contém dados sensíveis de conversas. Não há filtragem por remetente nem controle de acesso granular.

---

### MÉDIO (P2 — Próximo sprint)

#### 2.7 🟡 Ausência de HTTPS Enforced

O `helmet` configura HSTS, mas não há redirecionamento HTTP→HTTPS explícito. Em ambientes atrás de proxy (Railway, nginx), isso é geralmente adequado, mas vale documentar a expectativa.

#### 2.8 🟡 Logs podem vazar dados sensíveis

**Arquivo:** `src/queue/worker.js`

```js
logger.error({ jobId: job?.id, logId: job?.data?.logId, error: err?.message }, "Job failed");
```

O conteúdo da mensagem (`text`) é logado indiretamente em `dispatchWebhook("message.failed", { text: job.data.text })`. Se os logs forem acessíveis por terceiros, dados de conversas ficam expostos.

#### 2.9 🟡 `trust proxy` Fixo em 1

**Arquivo:** `src/server.js`

```js
app.set("trust proxy", 1);
```

Se a aplicação estiver atrás de mais de 1 proxy (ex: Cloudflare + Railway), o IP real do cliente será incorreto, comprometendo o rate limiting.

#### 2.10 🟡 Sem Proteção contra Slow HTTP Attacks

Não há configuração de timeout no servidor HTTP:
```js
server = app.listen(config.port, () => ...);
// Falta: server.setTimeout(30000);
// Falta: server.keepAliveTimeout = 65000;
```

---

## 3. ARQUITETURA E DESIGN

### Pontos Positivos ✅

1. **Separação de camadas clara:** Controllers → Services → DB/Queue
2. **Config centralizado:** `config.js` com validação de env vars obrigatórias e `Object.freeze()`
3. **Error hierarchy bem definida:** `AppError` base com subclasses tipadas (400, 401, 404, 409, 429, 503)
4. **Queue pattern correto:** BullMQ com backoff exponencial e retry configurável
5. **Graceful shutdown:** Encerra HTTP, worker, DB e Redis de forma ordenada
6. **Idempotência:** Unique index `(source, request_id)` previne duplicação

### Problemas e Melhorias

#### 3.1 Server.js Acumula Responsabilidades

**Arquivo:** `src/server.js`

O `server.js` faz configuração do Express **E** inicia o servidor **E** define o shutdown. Isso dificulta testes de integração (não dá para importar o `app` sem iniciar o listen).

**Correção recomendada:**
```
src/
  app.js       ← Configuração do Express (exporta app)
  server.js    ← Apenas listen + shutdown (importa app)
```

#### 3.2 Worker Criado como Side Effect no Boot

**Arquivo:** `src/server.js`

```js
(async () => {
    const { createWorker } = require("./queue/worker");
    const { closeWorker } = createWorker();
    // ...
})();
```

O `require` dentro de IIFE é um anti-pattern. O worker deveria ser criado explicitamente com injeção de dependência.

#### 3.3 Singleton Implícito no WhatsApp Client

**Arquivo:** `src/whatsapp/client.js`

```js
const whatsappClient = new WhatsAppClient();
module.exports = {
    whatsappClient,
    whatsappInit: () => whatsappClient.init(),
    // ... wrappers
};
```

Há um singleton no nível do módulo + funções wrapper que delegam para ele. As funções wrapper poderiam ser eliminadas se os controllers importassem `whatsappClient` diretamente.

#### 3.4 Falta Camada de Serviço para Mídia

Mensagens de texto passam por `messageService.queueTextMessage()` (com log no DB e fila), mas **mídias são enviadas diretamente** do controller sem log, sem fila, e sem retry:

```js
// Controller envia mídia diretamente, sem passar pelo service
const result = await sendImage(...);
```

**Impacto:** Mídias falhadas não são rastreadas, não têm retry automático, não aparecem nos logs do `whatsapp_message_log`.

---

## 4. CLEAN CODE E BOAS PRÁTICAS

### Pontos Positivos ✅

1. **"use strict"** em todos os arquivos
2. **Nomenclatura consistente** (camelCase para funções, PascalCase para classes)
3. **Comentários em português** (consistente com o domínio BR)
4. **ESLint configurado** com regras rígidas (no-eval, eqeqeq, prefer-const)
5. **Prettier configurado** para formatação automática
6. **Validação de input** centralizada em `validators.js`
7. **Sanitização** com `sanitizeOptionalString()`

### Problemas

#### 4.1 Magic Numbers

**Arquivo:** `src/whatsapp/client.js`

```js
#getReconnectDelay() {
    return Math.min(2000 * Math.pow(2, this.#reconnectAttempts), 60000);
    //          ^^^^                                               ^^^^^
    //        magic numbers — deveriam ser constantes nomeadas ou config
}
```

**Outros exemplos:**
- `src/controllers/WhatsAppController.js:` `Math.min(Number(req.query.limit) || 50, 200)` — 50 e 200 sem constantes
- `src/middleware/auth.js:` `MAX_KEY_LENGTH = 256` — está bom, mas o `256` poderia vir do config

#### 4.2 Inconsistência na Linguagem dos Comentários

O código mistura inglês e português:
- Nomes de funções: em inglês (`handlePostSendText`, `buildCandidates`)
- Comentários: em português (`// Validação async de DNS`, `// Campos obrigatórios`)
- Logs: mistura (`"Job completed"` vs `"Mensagem enfileirada"`)
- Erros para o usuário: em português (`"Campos 'to' e 'text' são obrigatórios"`)

**Recomendação:** Padronize a linguagem. Para uma API, mensagens de erro em **inglês** são mais universais. Comentários podem ficar em português se a equipe for BR.

#### 4.3 Tratamento de Erros Inconsistente nos Controllers

**Arquivo:** `src/controllers/LogController.js`

```js
} catch (err) {
    if (err instanceof ValidationError || err.message === "invalid_status") {
        //                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        // Comparar com string literal de mensagem é frágil
```

Comparar `err.message` com strings literais é frágil — se alguém mudar a mensagem, o catch não funciona mais.

#### 4.4 Arrow Functions Implícitas nos Exports do WhatsApp Client

```js
module.exports = {
    sendText: (to, text) => whatsappClient.sendText(to, text),
    // ...
};
```

Cada wrapper é idêntico à assinatura do método. Poderia ser simplificado com bind:
```js
module.exports = {
    sendText: whatsappClient.sendText.bind(whatsappClient),
};
```

Porém, o padrão atual é mais explícito e legível — é uma questão de preferência.

#### 4.5 Retorno Implícito em Express 5

Os controllers usam `throw` confiando que o Express 5 captura rejeições de Promise. Isso é correto, porém **não há documentação** explícita dessa dependência. Alguém que venha do Express 4 pode achar que falta um `try/catch` ou um `asyncHandler`.

---

## 5. POO E PADRÕES DE PROJETO

### Pontos Positivos ✅

1. **`WhatsAppClient`** — Encapsulamento correto com campos privados (`#sock`, `#isReady`, etc.)
2. **`RingBuffer`** — Estrutura de dados bem implementada com campos privados e interface limpa
3. **`AppError` hierarchy** — Herança clássica para tipagem de erros HTTP
4. **Event-driven** — `WhatsAppClient extends EventEmitter` (embora os eventos internos não sejam usados externamente)

### Problemas e Melhorias

#### 5.1 `WhatsAppClient` Viola o Single Responsibility Principle (SRP)

A classe tem **muitas responsabilidades:**
- Gerenciamento de conexão (init, disconnect, reconnect)
- Envio de mensagens (sendText, sendImage, sendDocument, sendAudio, sendVideo, sendLocation)
- Recebimento de mensagens (onMessagesUpsert)
- Resolução de JID (resolveJid)
- Geração de QR code
- Armazenamento de mensagens recebidas (RingBuffer)

**Sugestão de refatoração:**
```
WhatsAppClient         → Conexão e lifecycle
WhatsAppMessageSender  → Envio de mensagens
WhatsAppMessageStore   → Armazenamento e consulta
JidResolver            → Resolução de número → JID
```

#### 5.2 `EventEmitter` Extendido mas Não Utilizado

```js
class WhatsAppClient extends EventEmitter {
```

A classe herda de `EventEmitter` mas **nunca emite eventos próprios** (`this.emit(...)` não é chamado em nenhum lugar). Os eventos são disparados via `dispatchWebhook()`. Isso é dead code / dead inheritance.

**Correção:** Remover `extends EventEmitter` ou realmente emitir eventos internos que permitem plugins/extensões.

#### 5.3 Ausência de Interfaces / Contratos

Sendo JavaScript (não TypeScript), não há interfaces formais. Porém, poderia usar **JSDoc `@typedef`** ou melhor, **migrar para TypeScript** para garantir contratos entre camadas:

```ts
interface MessageSender {
    sendText(to: string, text: string): Promise<SendResult>;
    sendImage(to: string, url: string, caption?: string): Promise<SendResult>;
}
```

#### 5.4 Controllers São Funções Soltas, Não Classes

Os controllers (`WhatsAppController.js`, `LogController.js`) exportam funções soltas sem estado. Isso é perfeitamente válido em Node.js/Express, mas não segue POO. Se POO for desejado:

```js
class WhatsAppController {
    #messageService;
    #whatsappClient;

    constructor(messageService, whatsappClient) {
        this.#messageService = messageService;
        this.#whatsappClient = whatsappClient;
    }

    async postSendText(req, res) { ... }
}
```

Isso habilitaria **injeção de dependência**, facilitando testes sem mocks globais.

#### 5.5 Falta o Padrão Repository

O `messageService.js` acessa o banco diretamente via `sql`:
```js
const [{ id: logId }] = await sql`insert into whatsapp_message_log ...`;
```

Com um **Repository Pattern**, a lógica de persistência ficaria isolada:
```js
class MessageLogRepository {
    async create(data) { ... }
    async updateStatus(id, status) { ... }
    async findById(id) { ... }
    async findWithPagination(filters) { ... }
}
```

---

## 6. TESTES E COBERTURA

### Resumo

| Módulo | Testes | Cobertura Estimada |
|---|---|---|
| auth.js | 5 | 90% |
| errors.js | 9 | 95% |
| logController.js | 9 | 80% |
| messageService.js | 8 | 75% |
| phoneNormalizer.js | 8 | 85% |
| requestId.js | 15 | 95% |
| ringBuffer.js | 11 | 95% |
| validators.js | 23 | 85% |
| webhook.js | 8 | 80% |
| whatsappController.js | 18 | 75% |
| worker.js | 7 | 70% |

### Lacunas Identificadas

#### 6.1 Sem Testes de Integração

Não há testes que validem o fluxo completo:  
`POST /send → messageService → queue → worker → sendText → DB update`

#### 6.2 Sem Testes para `server.js`

O arquivo `server.js` (boot, shutdown, middleware stack) não tem nenhum teste. Deveria ter testes de integração para:
- Middleware ordering
- Error handler global
- Graceful shutdown
- Rate limiting behavior

#### 6.3 Sem Testes para `pg.js` e `redis.js`

Os módulos de conexão com banco e Redis não têm testes. Faltam testes para:
- Connection failure handling
- Reconnection logic
- SSL configuration

#### 6.4 Sem Testes para `client.js` (WhatsApp)

A classe `WhatsAppClient` não tem nenhum teste unitário. Faltam testes para:
- `init()` e reconnect logic
- `resolveJid()` fallback behavior
- Connection update handlers
- Message upsert processing

#### 6.5 Sem Testes de Concorrência

Nenhum teste valida comportamento sob carga ou condições de corrida:
- Envio simultâneo de mensagens
- Race condition no `queueTextMessage` (duplicate request_id)
- Worker processando múltiplos jobs

---

## 7. PERFORMANCE E ESCALABILIDADE

### Pontos Positivos ✅
- **BullMQ** com rate limiter (1 msg/s) — protege contra ban do WhatsApp
- **Connection pooling** PostgreSQL (max 10)
- **RingBuffer** O(1) para insert — eficiente para mensagens recebidas
- **Cursor-based pagination** — melhor que offset para grandes datasets

### Problemas

#### 7.1 Single Instance Lock

A aplicação roda como **instância única** (PM2 instances: 1, Baileys não suporta multi-instance). Não escala horizontalmente.

**Mitigação:** Documentar claramente que o WhatsApp Baileys é single-socket. Para scaling, considere arquitetura com servidor API separado do worker WhatsApp.

#### 7.2 RingBuffer de Mensagens em Memória

```js
this.#receivedMessages = new RingBuffer(config.maxStoredMessages); // 500
```

Mensagens recebidas são armazenadas **apenas em memória**. Se a aplicação reiniciar, todas são perdidas. Para produção, considere persistir em Redis ou DB.

#### 7.3 `getLogs()` com WHERE Dinâmico

```js
const conditions = [];
if (status) conditions.push(sql`status = ${status}`);
if (cursorNum) conditions.push(sql`id < ${cursorNum}`);
const where = conditions.length > 0
    ? sql`where ${conditions.reduce((a, b) => sql`${a} and ${b}`)}`
    : sql``;
```

Construção correta e segura (parametrizada), mas o `reduce` cria fragmentos SQL intermediários a cada iteração. Para 2 condições é trivial, mas o pattern não escala bem para queries dinâmicas complexas.

#### 7.4 Webhook Fire-and-Forget Sem Retry

```js
async function dispatchWebhook(event, data) {
    // Uma única tentativa — se falhar, o evento é perdido
}
```

Se o webhook falhar, o evento é perdido para sempre. Considerar enfileirar webhooks no BullMQ com retry.

#### 7.5 DNS Lookup em Cada Request de Mídia

```js
async function validateMediaUrlDns(urlStr) {
    const { address } = await lookup(host);
}
```

Cada envio de mídia faz um DNS lookup síncrono → async. Para alto throughput, considere um cache DNS curto (30-60s).

---

## 8. INFRAESTRUTURA E DEVOPS

### Pontos Positivos ✅

1. **Dockerfile** bem otimizado (multi-stage-like, non-root user, healthcheck)
2. **.gitignore** correto (node_modules, auth/, .env)
3. **ESLint 9 flat config** com regras rígidas
4. **Prettier** configurado
5. **PM2** com restart policy e log rotation

### Problemas

#### 8.1 Sem CI/CD Pipeline

Não há `.github/workflows/`, `Jenkinsfile`, ou similar. Faltam:
- Lint automático no PR
- Testes automáticos no PR
- Build e deploy automatizado
- Audit de dependências (`npm audit`)

#### 8.2 Sem `package-lock.json` no Dockerfile?

```dockerfile
COPY package.json package-lock.json* ./
```

O `*` no `package-lock.json*` significa que se o lock file **não existir**, o build continua sem erro. Isso pode causar builds não reproduzíveis.

#### 8.3 Sem `.env.example`

Falta um `.env.example` com todas as variáveis documentadas (sem valores reais). Novos desenvolvedores não sabem quais variáveis são necessárias.

#### 8.4 Logs do PM2 Sem Rotação

```js
out_file: "./logs/out.log",
error_file: "./logs/error.log",
```

Os logs vão para arquivo sem rotação automática. Em produção, o disco vai encher eventualmente. Considere `pm2-logrotate` ou redirecionar para um serviço de logs (Datadog, CloudWatch).

#### 8.5 Diretório `auth/` Vazio no Repositório

O diretório `auth/` está no repo mas está vazio e git-ignored. Ele deveria ser criado automaticamente pelo startup script, não existir no repo.

---

## 9. BANCO DE DADOS

### Pontos Positivos ✅
- **Parameterized queries** em todo o codebase (sem SQL injection)
- **Índices** bem planejados para as queries existentes
- **Constraint de unicidade** para idempotência `(source, request_id)`
- **CHECK constraint** para status válidos

### Problemas

#### 9.1 Sem Sistema de Migrations

O `schema.sql` é um arquivo estático. Não há:
- Controle de versão do schema (Prisma, Knex, node-pg-migrate)
- Migrations up/down
- Seed data
- Histórico de alterações

**Risco:** Alterações manuais no banco sem rastreabilidade.

#### 9.2 `SERIAL` em vez de `BIGSERIAL`

```sql
id SERIAL PRIMARY KEY,
```

`SERIAL` = `INTEGER` (max ~2.1 bilhões). Para um gateway com alto volume, considere `BIGSERIAL`.

#### 9.3 Sem Índice Parcial para Jobs Pendentes

Queries como "mensagens com status=queued" seriam beneficiadas por:
```sql
CREATE INDEX idx_msg_log_queued ON whatsapp_message_log(id DESC) WHERE status = 'queued';
```

#### 9.4 Sem Política de Retenção/Archival

A tabela vai crescer indefinidamente. Faltam:
- Partition by date
- TTL ou archival de mensagens antigas
- Script de limpeza periódica

#### 9.5 Texto da Mensagem Sem Limite no DB

```sql
message_text TEXT,  -- sem limite!
```

O validator limita a 4096 chars, mas o DB aceita qualquer tamanho. Deveria ter `VARCHAR(4096)` ou `CHECK (length(message_text) <= 4096)`.

---

## 10. PLANO DE AÇÃO PRIORIZADO

### P0 — CRÍTICO (Resolver HOJE)

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 1 | **Trocar API_KEY** por hash aleatório de 32+ chars | `.env` | 5 min |
| 2 | **Rotacionar credenciais** do Supabase/Postgres | Supabase Dashboard | 15 min |
| 3 | Verificar se `.env` foi commitado no Git (`git log --all -- .env`) | Terminal | 5 min |
| 4 | Remover `SUPABASE_KEY` do `.env` se não for usada no código | `.env` | 2 min |

### P1 — ALTO (Resolver esta semana)

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 5 | Validar `webhookUrl` contra SSRF no boot | `config.js` ou `webhook.js` | 30 min |
| 6 | Adicionar `server.setTimeout()` e `keepAliveTimeout` | `server.js` | 10 min |
| 7 | Criar `.env.example` com todas as variáveis | Novo arquivo | 15 min |
| 8 | Separar `app.js` do `server.js` para testabilidade | `src/` | 1h |
| 9 | Adicionar timeouts no graceful shutdown | `server.js` | 30 min |

### P2 — MÉDIO (Próximo sprint)

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 10 | Implementar sistema de migrations (node-pg-migrate) | `migrations/` | 2h |
| 11 | Adicionar testes de integração | `tests/integration/` | 4h |
| 12 | Testes unitários para `WhatsAppClient` | `tests/client.test.js` | 3h |
| 13 | Persistir mensagens recebidas em DB ou Redis | `whatsapp/client.js` | 2h |
| 14 | Enfileirar webhooks no BullMQ (retry) | `webhook.js` | 2h |
| 15 | Criar CI/CD pipeline (GitHub Actions) | `.github/workflows/` | 2h |
| 16 | Padronizar linguagem de logs/erros (PT ou EN) | Todo o projeto | 2h |

### P3 — BAIXO (Backlog)

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 17 | Migrar para TypeScript | Todo o projeto | 1-2 semanas |
| 18 | Extrair `WhatsAppClient` em sub-classes (SRP) | `whatsapp/` | 4h |
| 19 | Implementar Repository Pattern | `src/repositories/` | 3h |
| 20 | Converter controllers para classes com DI | `src/controllers/` | 3h |
| 21 | Adicionar política de retenção no DB | `schema.sql` | 2h |
| 22 | Logging unificado de requests (correlation ID + duration) | middleware | 2h |
| 23 | Enfileirar mídia da mesma forma que texto (com DB log) | `messageService.js` | 3h |
| 24 | Cache DNS para validação de URL | `validators.js` | 1h |
| 25 | Remover `extends EventEmitter` do WhatsAppClient | `client.js` | 10 min |

---

## APÊNDICE A — Checklist OWASP Top 10

| # | Vulnerabilidade | Status | Nota |
|---|---|---|---|
| A01 | Broken Access Control | ⚠️ | Auth por API Key única, sem RBAC |
| A02 | Cryptographic Failures | 🔴 | API_KEY fraca (8 dígitos) |
| A03 | Injection | ✅ | Queries parametrizadas, input validation |
| A04 | Insecure Design | ⚠️ | Mídia sem log/retry, mensagens em memória |
| A05 | Security Misconfiguration | ⚠️ | Webhook sem SSRF validation |
| A06 | Vulnerable Components | ✅ | Deps atualizadas (Express 5, Baileys 7) |
| A07 | Auth Failures | 🔴 | Credenciais fracas no .env |
| A08 | Software Integrity | ✅ | package-lock.json + npm ci |
| A09 | Logging & Monitoring | ⚠️ | Pino OK, mas sem alertas/monitoring |
| A10 | SSRF | ✅/⚠️ | Mídia validada, webhook NÃO validado |

---

## APÊNDICE B — Análise de Dependências

| Dependência | Versão | Status | Risco |
|---|---|---|---|
| @whiskeysockets/baileys | ^7.0.0-rc.9 | ⚠️ RC (release candidate) | API instável, pode quebrar |
| bullmq | ^5.68.0 | ✅ Estável | — |
| cors | ^2.8.6 | ✅ Estável | — |
| dotenv | ^17.2.4 | ✅ Estável | — |
| express | ^5.2.1 | ⚠️ Express 5 (recente) | API changes possíveis |
| express-rate-limit | ^8.2.1 | ✅ Estável | — |
| helmet | ^8.1.0 | ✅ Estável | — |
| ioredis | ^5.9.2 | ✅ Estável | — |
| pino | ^10.3.1 | ✅ Estável | — |
| postgres | ^3.4.8 | ✅ Estável | — |
| qrcode | ^1.5.4 | ✅ Estável | — |

**Nota:** Baileys `7.0.0-rc.9` é uma release candidate — pode ter bugs e breaking changes. Fixe a versão exata no `package.json` ao invés de usar `^`.

---

*Fim do relatório. Recomendação: iniciar pelas ações P0 (segurança) e P1 (estabilidade) antes de seguir para melhorias de código.*
