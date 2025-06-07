import * as crypto from "crypto"

/**
 * Generate a secure random string
 * @param length Length of the string
 * @param encoding Encoding to use (hex, base64, etc.)
 * @returns Random string
 */
export function generateRandomString(length = 32, encoding: BufferEncoding = "hex"): string {
  return crypto.randomBytes(length).toString(encoding)
}

/**
 * Generate a secure random number within a range
 * @param min Minimum value (inclusive)
 * @param max Maximum value (exclusive)
 * @returns Random number
 */
export function generateRandomNumber(min: number, max: number): number {
  const range = max - min
  const bytes = crypto.randomBytes(4)
  const value = bytes.readUInt32LE(0) / 0xffffffff // Convert to value between 0 and 1
  return Math.floor(value * range + min)
}

/**
 * Generate a secure random UUID
 * @returns Random UUID
 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/**
 * Compare two strings in constant time to prevent timing attacks
 * @param a First string
 * @param b Second string
 * @returns True if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

/**
 * Create a deterministic hash of a value
 * @param value Value to hash
 * @param algorithm Hash algorithm to use
 * @returns Hashed value
 */
export function hashValue(value: string, algorithm = "sha256"): string {
  return crypto.createHash(algorithm).update(value).digest("hex")
}

/**
 * Derive a key from a password using PBKDF2
 * @param password Password to derive key from
 * @param salt Salt for key derivation
 * @param iterations Number of iterations
 * @param keyLength Length of the derived key
 * @returns Derived key
 */
export function deriveKey(password: string, salt: string, iterations = 100000, keyLength = 32): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, "sha512", (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey.toString("hex"))
    })
  })
}
