import { EnvConfig } from "./env.validation";

/**
 * Configuration factory that structures validated env vars
 * into logical groups for easy access throughout the app
 */
export default (validatedEnv: EnvConfig) => ({
  app: {
    nodeEnv: validatedEnv.NODE_ENV,
    port: validatedEnv.PORT,
  },

  database: {
    host: validatedEnv.DB_HOST,
    port: validatedEnv.DB_PORT,
    username: validatedEnv.DB_USERNAME,
    password: validatedEnv.DB_PASSWORD,
    database: validatedEnv.DB_DATABASE,
    ssl: validatedEnv.DB_SSL,
  },

  jwt: {
    secret: validatedEnv.JWT_SECRET,
    expiry: validatedEnv.JWT_EXPIRY,
  },

  wallet: {
    encryptionKey: validatedEnv.WALLET_ENCRYPTION_KEY,
  },

  externalApi: {
    key: validatedEnv.EXTERNAL_API_KEY,
    url: validatedEnv.EXTERNAL_API_URL,
  },

  mail: {
    host: validatedEnv.MAIL_HOST,
    port: validatedEnv.MAIL_PORT,
    user: validatedEnv.MAIL_USER,
    password: validatedEnv.MAIL_PASSWORD,
    from: validatedEnv.MAIL_FROM,
  },
});
