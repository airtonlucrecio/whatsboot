FROM node:20-alpine

WORKDIR /app

# Copia package files primeiro (aproveita cache do Docker)
COPY package.json package-lock.json* ./

# Instala só dependências de produção
RUN npm ci --omit=dev

# Copia código fonte
COPY src/ ./src/
COPY ecosystem.config.js ./

# Garante que o diretório de auth existe com permissões corretas
RUN mkdir -p /data/auth

# Porta padrão (deve bater com PORT env var ou 3333)
EXPOSE 3333

# Health check integrado ao Docker/Railway
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-3333}/healthz || exit 1

# Inicia aplicação
CMD ["node", "src/server.js"]
