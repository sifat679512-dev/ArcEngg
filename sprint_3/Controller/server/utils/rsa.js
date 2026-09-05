/**
 * RSA Encryption/Decryption Utility
 * Simple RSA implementation following Python-style pattern
 * Built from scratch without external libraries
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KEYS_FILE_PATH = __dirname + '/../user_keys.txt';

// Generate a random prime number
function generateRandomPrime(bits) {
  while (true) {
    // Generate a random number in range [2^(bits-1), 2^bits - 1]
    const min = BigInt(2) ** BigInt(bits - 1);
    const max = BigInt(2) ** BigInt(bits) - 1n;
    const range = max - min + 1n;
    
    // Use crypto.getRandomValues for better random number generation
    const bytes = Math.ceil(bits / 8);
    const randomBytes = new Uint8Array(bytes);
    crypto.getRandomValues(randomBytes);
    
    // Convert bytes to BigInt
    let randomOffset = 0n;
    for (let i = 0; i < randomBytes.length; i++) {
      randomOffset = (randomOffset << 8n) | BigInt(randomBytes[i]);
    }
    
    const num = min + (randomOffset % range);
    
    // Ensure odd number (even numbers can't be prime except 2)
    const oddNum = num | 1n;
    
    if (isPrime(oddNum)) {
      return oddNum;
    }
  }
}

// Miller-Rabin primality test
function isPrime(n, k = 2) {
  if (n <= 1n) return false;
  if (n <= 3n) return true;
  if (n % 2n === 0n) return false;

  let d = n - 1n;
  let s = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    s++;
  }

  for (let i = 0; i < k; i++) {
    const smallPrimes = [2n, 3n, 5n, 7n, 11n];
    const a = smallPrimes[i % smallPrimes.length];
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;

    for (let j = 0n; j < s - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) break;
    }
    if (x !== n - 1n) return false;
  }
  return true;
}

// Modular exponentiation: (base^exp) % mod
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

// GCD
function gcd(a, b) {
  while (b !== 0n) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

// Check if two numbers are coprime
function isCoprime(a, b) {
  return gcd(a, b) === 1n;
}

// Modular inverse using extended Euclidean algorithm
function modInverse(a, m) {
  const [gcd, x, _y] = extendedGCD(a, m);
  if (gcd !== 1n) {
    throw new Error('Modular inverse does not exist');
  }
  return ((x % m) + m) % m;
}

// Extended GCD
function extendedGCD(a, b) {
  if (a === 0n) {
    return [b, 0n, 1n];
  }
  const [gcd, x1, y1] = extendedGCD(b % a, a);
  const x = y1 - (b / a) * x1;
  const y = x1;
  return [gcd, x, y];
}

// Convert string to BigInt using UTF-8 hex encoding (like Python's int("x".encode("utf-8").hex(), 16))
function stringToBigInt(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result = (result << 8n) | BigInt(bytes[i]);
  }
  return result;
}

// Convert BigInt to string using UTF-8 decoding (like Python's bytes.fromhex(hex(m)[2:]).decode('utf-8'))
function bigIntToString(bigint) {
  const bytes = [];
  while (bigint > 0n) {
    bytes.unshift(Number(bigint & 0xFFn));
    bigint = bigint >> 8n;
  }
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(bytes));
}

// Generate RSA key pair
function generateKeyPair(bits = 512) {
  const p = generateRandomPrime(bits / 2);
  const q = generateRandomPrime(bits / 2);
  
  // Ensure p != q
  while (p === q) {
    q = generateRandomPrime(bits / 2);
  }
  
  const n = p * q;
  const phiN = (p - 1n) * (q - 1n);

  // Choose e (start with 11 like Python example, then find suitable e)
  let e = 11n;
  if (!(1n < e && e < phiN && isCoprime(e, phiN))) {
    e = 0n;
    for (let candidateE = 2n; candidateE < phiN; candidateE++) {
      if (isCoprime(candidateE, phiN)) {
        e = candidateE;
        break;
      }
    }
    if (e === 0n) {
      throw new Error("Could not find a suitable 'e'.");
    }
  }

  // Compute d = pow(e, -1, phiN) (modular inverse)
  const d = modInverse(e, phiN);

  return {
    p: p.toString(),
    q: q.toString(),
    n: n.toString(),
    e: e.toString(),
    d: d.toString(),
    phiN: phiN.toString()
  };
}

// Encrypt using public key: c = pow(m, e, n)
function encrypt(plaintext, publicKey) {
  const { e, n } = publicKey;
  const m = stringToBigInt(plaintext);
  const mBigInt = BigInt(m);
  const nBigInt = BigInt(n);
  const eBigInt = BigInt(e);
  
  if (mBigInt >= nBigInt) {
    throw new Error('Message too long for key size');
  }
  
  const c = modPow(mBigInt, eBigInt, nBigInt);
  return c.toString();
}

// Decrypt using private key: m = pow(c, d, n)
function decrypt(ciphertext, privateKey) {
  const { d, n } = privateKey;
  const c = BigInt(ciphertext);
  const nBigInt = BigInt(n);
  const dBigInt = BigInt(d);
  
  const m = modPow(c, dBigInt, nBigInt);
  return bigIntToString(m);
}

// Function to save user keys to user_keys.txt
export function saveUserKeys(username, keyPair) {
  try {
    const keyLine = `${username}|${keyPair.p}|${keyPair.q}|${keyPair.n}|${keyPair.e}|${keyPair.d}|${keyPair.phiN}\n`;
    console.log(`[RSA] Saving keys to: ${KEYS_FILE_PATH}`);
    fs.appendFileSync(KEYS_FILE_PATH, keyLine);
    console.log(`[RSA] Keys saved for user: ${username}`);
  } catch (e) {
    console.error(`[RSA] Error saving keys for user ${username}:`, e);
    throw e;
  }
}

// Function to load all user keys from user_keys.txt (returns array for duplicates)
export function loadUserKeys(username) {
  if (!fs.existsSync(KEYS_FILE_PATH)) {
    return null;
  }
  
  const content = fs.readFileSync(KEYS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  const matches = [];
  
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    // Skip ECC keys (they start with ECC_)
    if (line.startsWith('ECC_')) continue;
    
    const parts = line.split('|');
    if (parts[0] === username) {
      console.log(`[RSA] Found key line for ${username}:`, line);
      console.log(`[RSA] Parts count:`, parts.length);
      const keyObj = {
        p: parts[1],
        q: parts[2],
        n: parts[3],
        e: parts[4],
        d: parts[5],
        phiN: parts[6]
      };
      console.log(`[RSA] Key object:`, keyObj);
      matches.push(keyObj);
    }
  }
  
  console.log(`[RSA] Total matches for ${username}:`, matches.length);
  // Return single object (most recent) if multiple matches, single object if one match, null if none
  if (matches.length === 0) return null;
  // Return the last (most recent) match when there are duplicates
  return matches[matches.length - 1];
}

// Generate keys on demand (no caching)
export function getKeyPair(username) {
  console.log(`[RSA] Generating key pair for user: ${username} (this may take a moment)...`);
  const keyPair = generateKeyPair(512); // 512 bits for reasonable security and performance
  console.log(`[RSA] Key pair generated for user: ${username}`);
  return keyPair;
}

export {
  generateKeyPair,
  encrypt,
  decrypt
};
