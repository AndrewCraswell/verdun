# The sector server (apps/server): the battle on the real clock, whoever is playing, kept in SQLite on the service's
# volume (VERDUN_DB). Built from the context deploy/server/assemble.sh puts together; CI uploads it to Railway on every
# push to main that passes. Node runs the TypeScript as it is, so the workspace keeps its layout.
# Scripts are left out: the root's installs the Git hooks, and none of the server's dependencies needs to build.
FROM node:24.16.0-slim
RUN npm install --global pnpm@11.9.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter "@verdun/server..."
ENV NODE_ENV=production
CMD ["node", "apps/server/src/main.ts"]
