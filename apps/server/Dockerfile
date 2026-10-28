FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=development
ENV SLIDES_STORAGE_DIR=/app/storage/milven-slides
# Install OpenSSL for Prisma engines
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    libreoffice-impress \
    poppler-utils \
    fontconfig \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-lmodern \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY docker/fonts.conf /etc/fonts/conf.d/99-milven-substitutions.conf
RUN fc-cache -f && mkdir -p /usr/share/fonts/truetype/milven
COPY package*.json ./
# copy prisma early so postinstall/generate can find schema
COPY prisma ./prisma
RUN npm install --include=dev
COPY . .
# ensure client is generated with schema path
RUN npx prisma generate --schema=./prisma/schema.prisma
EXPOSE 4000
CMD ["node", "src/index.js"]


