FROM node:20-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* vars must be present at build time — Next.js bakes them into the client bundle
ARG NEXT_PUBLIC_FARAJA_API_URL
ENV NEXT_PUBLIC_FARAJA_API_URL=$NEXT_PUBLIC_FARAJA_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# standalone build output includes server.js + minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
