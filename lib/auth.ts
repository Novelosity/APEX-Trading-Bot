import { scrypt, randomBytes, timingSafeEqual } from 'crypto'

const KEYLEN = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, SCRYPT_PARAMS, (err, buf) => err ? reject(err) : resolve(buf))
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptAsync(password, salt, KEYLEN)
  return `${salt}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, storedHash] = stored.split(':')
    if (!salt || !storedHash) return false
    const hash = await scryptAsync(password, salt, KEYLEN)
    const storedBuf = Buffer.from(storedHash, 'hex')
    if (hash.length !== storedBuf.length) return false
    return timingSafeEqual(hash, storedBuf)
  } catch {
    return false
  }
}

/** Mask an API key for display — shows first 4 and last 4 chars */
export function maskApiKey(key: string): string {
  if (!key || key.length < 10) return '****'
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
}
