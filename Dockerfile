FROM node:20-alpine

WORKDIR /app

# Copia package files primeiro (aproveita cache do Docker)
COPY package.json package-lock.json* ./

# Instala só dependências de produção
RUN npm ci --omit=dev

# Copia código fonte
COPY src/ ./src/
COPY ecosystem.config.js ./

# Porta padrão
EXPOSE 8088

# Inicia aplicação
CMD ["node", "src/server.js"]
