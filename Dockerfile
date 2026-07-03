FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/soul.md ./soul.md
COPY --from=builder /app/skills ./skills
COPY --from=builder /app/.env.example ./.env.example
VOLUME ["/app/data"]
EXPOSE 8443
CMD ["node", "dist/index.js"]
