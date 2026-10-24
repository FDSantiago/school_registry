# Production image. Bun runs the TypeScript source directly, so there is no compile step.
FROM oven/bun:1.4.4

WORKDIR /app

# Install only runtime dependencies, exactly as pinned in bun.lock.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Run as the image's non-root user.
USER bun
CMD ["bun", "src/index.ts"]
