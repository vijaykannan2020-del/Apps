# Forge API: Node + git + the two coding agents (Claude Code and Codex CLIs).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl tini ripgrep jq python3 python3-pip python3-venv build-essential openssh-client \
    && rm -rf /var/lib/apt/lists/*
# AGENTS_REFRESH changes every week (setup.sh), so the agents are re-installed at their newest versions.
ARG AGENTS_REFRESH=0
RUN npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production PORT=8790 DATA_DIR=/app/data
# The agents refuse to skip permission prompts as root, so run as the image's "node" user (uid 1000).
USER node
EXPOSE 8790
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.mjs"]
