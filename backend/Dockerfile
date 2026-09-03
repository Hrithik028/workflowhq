FROM node:22.23.2-alpine3.24

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node migrations ./migrations
COPY --chown=node:node src ./src

ENV NODE_ENV=production
EXPOSE 5000
USER node

CMD ["sh", "-c", "npm run migrate && npm run migrate:status && npm start"]
