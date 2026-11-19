FROM node:22-alpine
RUN apk add --no-cache unzip tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY wallet ./wallet
# Public settings (no secrets): the server reads GOOGLE_CLIENT_ID from here when .env doesn't set it.
COPY deploy.conf ./deploy.conf
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.mjs"]
