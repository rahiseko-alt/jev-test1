# better-sqlite3 は導入時にその場で組み立てるため、組み立て道具を入れる。
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @factchecker/web build

ENV PORT=3000
EXPOSE 3000

# start の前に prepare が走り、設定の確認とデータベースの用意を行う。
CMD ["pnpm", "start"]
