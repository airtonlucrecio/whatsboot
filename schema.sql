-- Tabela de logs de mensagens enviadas pelo gateway
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
    id            SERIAL PRIMARY KEY,
    source        VARCHAR(100),
    request_id    VARCHAR(255),
    to_number     VARCHAR(20) NOT NULL,
    jid           VARCHAR(50) NOT NULL,
    message_text  TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',
    queue_job_id  VARCHAR(100),
    attempts      INT DEFAULT 0,
    last_error    TEXT,
    queued_at     TIMESTAMPTZ,
    sent_at       TIMESTAMPTZ,
    failed_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_msg_log_status ON whatsapp_message_log(status);
CREATE INDEX IF NOT EXISTS idx_msg_log_created ON whatsapp_message_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_log_to ON whatsapp_message_log(to_number);
