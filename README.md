# WhatsApp Gateway API

Gateway de WhatsApp via API REST, estilo Z-API / Evolution API. Conecta no WhatsApp Web via WebSocket (Baileys), envia e recebe mensagens, e dispara webhooks para seu CRM.

## Arquitetura

```
┌──────────┐     HTTP      ┌───────────────────┐    WebSocket    ┌──────────┐
│  Seu CRM │  ──────────▶  │  WhatsApp Gateway │  ────────────▶  │ WhatsApp │
│          │  ◀──────────  │    (Express)      │  ◀────────────  │          │
└──────────┘   Webhook     └───────────────────┘                 └──────────┘
                                │         │
                           ┌────┘         └────┐
                      ┌────┴────┐        ┌─────┴────┐
                      │  Redis  │        │ Postgres  │
                      │ (fila)  │        │  (logs)   │
                      └─────────┘        └──────────┘
```

## Funcionalidades

- ✅ Login via QR Code (WhatsApp Web)
- ✅ Reconexão automática com backoff exponencial
- ✅ Envio de texto (com fila e retry automático)
- ✅ Envio de imagem, vídeo, áudio, documento e localização
- ✅ Recebimento de mensagens em tempo real
- ✅ Webhooks para CRM (mensagem recebida, enviada, falhou, status de entrega)
- ✅ Rate limiting por fila (BullMQ)
- ✅ Logs estruturados (Pino)
- ✅ Graceful shutdown
- ✅ Pronto para PM2 em produção

## Requisitos

- **Node.js** >= 18
- **Redis** (para fila BullMQ)
- **PostgreSQL** (para logs de mensagens)

## Instalação

```bash
# 1. Clone o projeto
git clone <seu-repo> whatsapp-gateway
cd whatsapp-gateway

# 2. Instale as dependências
npm install

# 3. Configure o .env
cp .env .env.local
# edite o .env com suas configurações

# 4. Crie a tabela no Postgres
psql -d whatsapp_gateway -f schema.sql

# 5. Inicie em modo desenvolvimento
npm run dev
```

## Configuração (.env)

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta da API | `3333` |
| `API_KEY` | Chave de autenticação (header `x-api-key`) | — |
| `LOG_LEVEL` | Nível de log (`debug`, `info`, `warn`, `error`) | `info` |
| `NODE_ENV` | Ambiente (`development` / `production`) | `development` |
| `REDIS_HOST` | Host do Redis | `localhost` |
| `REDIS_PORT` | Porta do Redis | `6379` |
| `REDIS_PASSWORD` | Senha do Redis (opcional) | — |
| `DATABASE_URL` | Connection string do Postgres | — |
| `RATE_LIMIT_MAX` | Máx. mensagens por intervalo | `1` |
| `RATE_LIMIT_DURATION_MS` | Duração do intervalo (ms) | `1000` |
| `WEBHOOK_URL` | URL do CRM para receber eventos | — |
| `WEBHOOK_TOKEN` | Token enviado no header `X-Webhook-Token` | — |
| `WEBHOOK_TIMEOUT_MS` | Timeout do webhook (ms) | `5000` |

## Autenticação

Todas as rotas (exceto `/health`) exigem o header:

```
x-api-key: SUA_API_KEY
```

## Endpoints

### Conexão

#### `GET /health`
Health check (sem autenticação). Retorna 200 se conectado, 503 se não.

```json
{
  "service": "whatsapp-gateway",
  "uptime": 3600,
  "ready": true,
  "hasQr": false
}
```

#### `GET /status`
Status da conexão.

```json
{ "ready": true, "hasQr": false }
```

#### `GET /qr`
QR Code para conectar (base64 dataURL). Retorna 404 se já conectado.

```json
{ "qr": "data:image/png;base64,..." }
```

---

### Envio de mensagens

#### `POST /send` — Texto (via fila com retry)
```json
{
  "to": "5511999999999",
  "text": "Olá, tudo bem?",
  "source": "meu-crm",
  "request_id": "abc-123"
}
```
Resposta:
```json
{ "ok": true, "queued": true, "logId": 1, "jobId": "1" }
```

#### `POST /send/image`
```json
{
  "to": "5511999999999",
  "url": "https://example.com/foto.jpg",
  "caption": "Veja essa imagem"
}
```

#### `POST /send/document`
```json
{
  "to": "5511999999999",
  "url": "https://example.com/arquivo.pdf",
  "filename": "contrato.pdf",
  "caption": "Segue o documento"
}
```

#### `POST /send/audio`
```json
{
  "to": "5511999999999",
  "url": "https://example.com/audio.mp3",
  "ptt": true
}
> `ptt: true` envia como áudio de voz (bolinha). `false` envia como arquivo.

#### `POST /send/video`
```json
{
  "to": "5511999999999",
  "url": "https://example.com/video.mp4",
  "caption": "Confira o vídeo"
}
```

#### `POST /send/location`
```json
{
  "to": "5511999999999",
  "latitude": -23.5505,
  "longitude": -46.6333,
  "name": "São Paulo"
}
```

---

### Consultas

#### `GET /messages?limit=50`
Mensagens recebidas (buffer em memória, últimas 500).

```json
{
  "count": 2,
  "messages": [
    {
      "id": "ABCDEF123",
      "from": "5511888888888@s.whatsapp.net",
      "sender": "João",
      "timestamp": "2026-02-11T20:00:00.000Z",
      "type": "conversation",
      "text": "Oi, preciso de ajuda"
    }
  ]
}
```

#### `GET /logs?status=sent&limit=50`
Logs de mensagens enviadas (do banco de dados).

```json
[
  {
    "id": 1,
    "created_at": "2026-02-11T20:00:00.000Z",
    "to_number": "5511999999999",
    "message_text": "Olá!",
    "status": "sent",
    "attempts": 1,
    "last_error": null
  }
]
```

---

## Webhooks

Configure `WEBHOOK_URL` no `.env`. O gateway faz POST automático para seu CRM quando:

| Evento | Quando | Payload principal |
|---|---|---|
| `message` | Mensagem recebida | `from`, `sender`, `text`, `type` |
| `message.sent` | Mensagem enviada com sucesso | `logId`, `to`, `text`, `jobId` |
| `message.failed` | Mensagem falhou (todas tentativas) | `logId`, `to`, `error` |
| `message.update` | Status de entrega mudou | `id`, `status` (delivered/read/played) |
| `status` | Conexão mudou | `status` (connected/disconnected/logged_out) |

### Formato do webhook

```json
{
  "event": "message",
  "timestamp": "2026-02-11T20:00:00.000Z",
  "data": {
    "id": "ABCDEF123",
    "from": "5511888888888@s.whatsapp.net",
    "sender": "João",
    "text": "Oi, preciso de ajuda",
    "type": "conversation"
  }
}
```

Se configurado, o header `X-Webhook-Token` é enviado para autenticação no lado do CRM.

---

## Produção com PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar
pm2 start ecosystem.config.js

# Salvar para reiniciar no boot
pm2 save
pm2 startup

# Monitorar
pm2 logs whatsapp-gateway
pm2 monit
```

### Reconexão automática

```
WhatsApp desconecta
  → Backoff exponencial: 2s, 4s, 8s, 16s... até 60s
  → 10 tentativas
  → Se esgotar: process.exit(1) → PM2 reinicia o processo
  → Reconecta usando credenciais salvas em auth/
```

---

## Estrutura do projeto

```
├── .env                    # Configurações
├── .gitignore              # Ignora node_modules, auth, .env
├── ecosystem.config.js     # Configuração PM2
├── package.json
├── schema.sql              # Schema do banco Postgres
└── src/
    ├── server.js           # Express + startup + graceful shutdown
    ├── db/
    │   └── pg.js           # Pool PostgreSQL
    ├── queue/
    │   ├── redis.js        # Conexão Redis (ioredis)
    │   ├── whatsappQueue.js # Fila BullMQ
    │   └── worker.js       # Worker que processa envios
    ├── routes/
    │   └── index.js        # Todas as rotas da API
    ├── utils/
    │   ├── logger.js       # Logger Pino
    │   └── webhook.js      # Dispatcher de webhooks
    └── whatsapp/
        └── client.js       # Conexão Baileys + envio + recebimento
```

## Exemplo de integração com CRM

```javascript
// Enviar mensagem de texto
const response = await fetch("http://localhost:8088/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "SUA_API_KEY"
  },
  body: JSON.stringify({
    to: "5511999999999",
    text: "Seu pedido #1234 foi confirmado!",
    source: "meu-crm",
    request_id: "pedido-1234"
  })
});

const data = await response.json();
// { ok: true, queued: true, logId: 1, jobId: "1" }
```

```javascript
// Receber webhook no seu CRM (Express)
app.post("/webhook/whatsapp", (req, res) => {
  const { event, data } = req.body;

  if (event === "message") {
    console.log(`Mensagem de ${data.sender}: ${data.text}`);
    // processar no CRM...
  }

  if (event === "message.sent") {
    console.log(`Mensagem ${data.logId} enviada para ${data.to}`);
  }

  res.sendStatus(200);
});
```

## Licença

ISC
