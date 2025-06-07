import { registerAs } from "@nestjs/config"

export default registerAs("encryption", () => ({
  algorithm: process.env.ENCRYPTION_ALGORITHM || "aes-256-gcm",
  ivLength: Number.parseInt(process.env.ENCRYPTION_IV_LENGTH || "16", 10),
  keyLength: Number.parseInt(process.env.ENCRYPTION_KEY_LENGTH || "32", 10),
  key: process.env.ENCRYPTION_KEY,
  keyId: process.env.ENCRYPTION_KEY_ID || "default",
  useKeyRotation: process.env.ENCRYPTION_USE_KEY_ROTATION === "true",
}))
