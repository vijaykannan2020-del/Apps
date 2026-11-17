FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev web-push@4
COPY server.mjs .
CMD ["node", "server.mjs"]
