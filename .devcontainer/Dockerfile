# Development image: Bun plus the tools needed to work on the project.
FROM oven/bun:1.4.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# The base image already has a non-root "bun" user (uid 1000).
USER bun
