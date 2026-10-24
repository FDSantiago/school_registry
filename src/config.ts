import { z } from "zod";

// Every setting comes from environment variables (see .env.example).
const ConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().startsWith("mysql://"),
    REGISTRY_READ_KEY: z.string().min(16),
    REGISTRY_ADMIN_KEY: z.string().min(16),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  })
  .refine((c) => c.REGISTRY_READ_KEY !== c.REGISTRY_ADMIN_KEY, {
    message: "REGISTRY_READ_KEY and REGISTRY_ADMIN_KEY must be different",
  });

export type Config = {
  port: number;
  databaseUrl: string;
  readKey: string;
  adminKey: string;
  rateLimitPerMinute: number;
};

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    // Only print which settings are wrong, never their values (they include API keys).
    const problems = result.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`);
    throw new Error(`Invalid configuration:\n  ${problems.join("\n  ")}`);
  }
  const c = result.data;
  return {
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    readKey: c.REGISTRY_READ_KEY,
    adminKey: c.REGISTRY_ADMIN_KEY,
    rateLimitPerMinute: c.RATE_LIMIT_PER_MINUTE,
  };
}
