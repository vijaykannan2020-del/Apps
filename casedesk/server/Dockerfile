FROM node:22-alpine
RUN apk add --no-cache unzip tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.mjs"]
