FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY migrations ./migrations
COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

CMD ["sh", "-c", "npm run migrate && npm start"]
