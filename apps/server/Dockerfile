FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=development
# Install OpenSSL for Prisma engines
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# copy prisma early so postinstall/generate can find schema
COPY prisma ./prisma
RUN npm i -g npm@latest && npm install --include=dev
COPY . .
# ensure client is generated with schema path
RUN npx prisma generate --schema=./prisma/schema.prisma
EXPOSE 4000
CMD ["node", "src/index.js"]


