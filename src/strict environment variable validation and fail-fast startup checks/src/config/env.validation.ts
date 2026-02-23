import { z } from "zod";

/**
 * Environment validation schema using Zod
 * All environment variables are validated at application startup
 */
export const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(65535))
    .default("3000"),

  // Database Configuration
  DB_HOST: z.string().min(1, "DB_HOST is required"),
  DB_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  DB_USERNAME: z.string().min(1, "DB_USERNAME is required"),
  DB_PASSWORD: z.string().min(1, "DB_PASSWORD is required"),
  DB_DATABASE: z.string().min(1, "DB_DATABASE is required"),
  DB_SSL: z
    .string()
    .transform((val) => val === "true")
    .default("false"),

  // JWT Configuration
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters for security"),
  JWT_EXPIRY: z.string().transform(Number).pipe(z.number().positive()),

  // Wallet Encryption
  WALLET_ENCRYPTION_KEY: z
    .string()
    .length(32, "WALLET_ENCRYPTION_KEY must be exactly 32 characters"),

  // External API
  EXTERNAL_API_KEY: z.string().min(1, "EXTERNAL_API_KEY is required"),
  EXTERNAL_API_URL: z.string().url("EXTERNAL_API_URL must be a valid URL"),

  // Mail Configuration
  MAIL_HOST: z.string().min(1, "MAIL_HOST is required"),
  MAIL_PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  MAIL_USER: z.string().email("MAIL_USER must be a valid email"),
  MAIL_PASSWORD: z.string().min(1, "MAIL_PASSWORD is required"),
  MAIL_FROM: z.string().email("MAIL_FROM must be a valid email"),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates environment variables and returns typed config
 * Throws detailed error if validation fails
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  try {
    return envSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join(".")}: ${err.message}`,
      );
      throw new Error(
        `Environment validation failed:\n${errorMessages.join("\n")}`,
      );
    }
    throw error;
  }
}
