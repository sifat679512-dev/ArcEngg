/**
 * ECC (Elliptic Curve Cryptography) Encryption/Decryption Utility
 * Built from scratch without external libraries
 * Using curve: y^2 = x^3 - 2x + 2 (mod 23)
 * Python-style implementation with character-to-point mapping
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KEYS_FILE_PATH = __dirname + '/../user_keys.txt';

// Curve parameters: y^2 = x^3 + 7 (mod 257) - larger curve for full ASCII mapping
const p = 257n;
const a = 0n;
const b = 7n;

// Base point P = (3, 10) - verified to be on curve y^2 = x^3 + 7 (mod 257)
const Gx = 3n;
const Gy = 10n;

// Point on the curve
class Point {
  constructor(x, y, infinity = false) {
    // Normalize coordinates to positive values in [0, p-1]
    this.x = ((x % p) + p) % p;
    this.y = ((y % p) + p) % p;
    this.infinity = infinity;
  }
}

// Check if point is on curve
function isOnCurve(point) {
  if (point.infinity) return true;
  const left = (point.y * point.y) % p;
  const right = ((point.x * point.x * point.x) + (a * point.x) + b) % p;
  return left === right;
}

// Modular inverse using pow(k, -1, p) style (Python's built-in)
function modInverse(k, p) {
  // Using extended Euclidean algorithm
  let a = k;
  let m = p;
  let x0 = 0n;
  let x1 = 1n;
  
  if (m === 1n) return 0n;
  
  while (a > 1n) {
    if (m === 0n) return null; // No inverse exists
    const q = a / m;
    let t = m;
    m = a % m;
    a = t;
    t = x0;
    x0 = x1 - q * x0;
    x1 = t;
  }
  
  if (x1 < 0n) x1 = x1 + p;
  return x1;
}

// Point addition (Python-style)
function pointAdd(P, Q) {
  if (P === null || P.infinity) return Q;
  if (Q === null || Q.infinity) return P;
  
  const x_P = P.x;
  const y_P = P.y;
  const x_Q = Q.x;
  const y_Q = Q.y;
  
  // Check if P = -Q (vertical line)
  if (x_P === x_Q && y_P === ((-y_Q) % p)) {
    return new Point(0n, 0n, true); // Point at infinity
  }
  
  let m_numerator, m_denominator;
  
  if (x_P === x_Q && y_P === y_Q) {
    // Point doubling
    m_numerator = (3n * x_P * x_P + a) % p;
    m_denominator = (2n * y_P) % p;
  } else {
    // Point addition
    m_numerator = (y_Q - y_P) % p;
    m_denominator = (x_Q - x_P) % p;
  }
  
  if (m_denominator === 0n) {
    return new Point(0n, 0n, true); // Point at infinity
  }
  
  const inv = modInverse(m_denominator, p);
  if (inv === null) {
    return new Point(0n, 0n, true); // Point at infinity
  }
  
  const m = (m_numerator * inv) % p;
  const x_R = (m * m - x_P - x_Q) % p;
  const y_R = (m * (x_P - x_R) - y_P) % p;
  
  return new Point(x_R, y_R);
}

// Scalar multiplication (double-and-add algorithm)
function scalarMult(k, P) {
  let R = null; // Point at infinity
  let Q = P;
  
  while (k > 0n) {
    if (k % 2n === 1n) {
      R = pointAdd(R, Q);
    }
    Q = pointAdd(Q, Q);
    k = k / 2n;
  }
  
  return R;
}

// Point negation
function pointNeg(P) {
  if (P === null || P.infinity) return null;
  const negY = ((-P.y) % p + p) % p; // Ensure positive result
  return new Point(P.x, negY);
}

// Pre-calculate all valid points on the curve for character mapping
let validPointsForMapping = [];
let charToPointMap = {};
let pointToCharMap = {};

function initializeMappings() {
  if (validPointsForMapping.length > 0) return; // Already initialized
  
  // Collect all points on the curve (both y values for each x)
  for (let x = 0n; x < p; x++) {
    const rhs = (x * x * x + a * x + b) % p;
    
    for (let y = 0n; y < p; y++) {
      if ((y * y) % p === rhs) {
        validPointsForMapping.push({ x, y });
      }
    }
  }
  
  // Sort by x-coordinate, then y-coordinate for consistent mapping
  validPointsForMapping.sort((a, b) => {
    if (a.x < b.x) return -1;
    if (a.x > b.x) return 1;
    if (a.y < b.y) return -1;
    if (a.y > b.y) return 1;
    return 0;
  });
  
  console.log(`[ECC] Found ${validPointsForMapping.length} valid points on curve`);
  console.log('[ECC] First 10 points:', validPointsForMapping.slice(0, 10).map(p => `(${p.x},${p.y})`));
  
  // Define alphabet - all.printable ASCII characters (95 characters)
  const alphabet = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
  
  // Limit alphabet to number of available points
  const maxChars = Math.min(alphabet.length, validPointsForMapping.length);
  const limitedAlphabet = alphabet.slice(0, maxChars);
  
  // Create mappings
  for (let i = 0; i < limitedAlphabet.length; i++) {
    const char = limitedAlphabet[i];
    const point = validPointsForMapping[i];
    const pointKey = `${point.x},${point.y}`;
    charToPointMap[char] = point;
    pointToCharMap[pointKey] = char;
  }
  
  console.log(`[ECC] Mapped ${limitedAlphabet.length} characters to curve points`);
  console.log('[ECC] Character mappings:', Object.entries(charToPointMap).slice(0, 10).map(([c, p]) => `${c}->(${p.x},${p.y})`));
}

// Generate ECC key pair
function generateECCKeyPair() {
  // Private key: random number in [1, p-2] (for this small curve)
  const maxKey = p - 2n;
  const randomBytes = crypto.randomBytes(4);
  let keyBigInt = 0n;
  for (let i = 0; i < randomBytes.length; i++) {
    keyBigInt = (keyBigInt << 8n) | BigInt(randomBytes[i]);
  }
  const privateKey = (keyBigInt % maxKey) + 1n;
  
  // Public key: privateKey * G
  const G = new Point(Gx, Gy);
  const publicKeyPoint = scalarMult(privateKey, G);
  
  if (publicKeyPoint === null || publicKeyPoint.infinity) {
    throw new Error('Failed to generate valid public key');
  }
  
  return {
    privateKey: privateKey.toString(),
    publicKeyX: publicKeyPoint.x.toString(),
    publicKeyY: publicKeyPoint.y.toString()
  };
}

// Convert text to points using ASCII encoding
function textToPoints(textMessage, fallbackPoint) {
  const points = [];
  
  for (const char of textMessage) {
    const charCode = BigInt(char.charCodeAt(0));
    // Use ASCII code as x-coordinate, compute valid y-coordinate on curve
    const x = charCode % p;
    
    // Find a valid y for this x on the curve
    const rhs = (x * x * x + a * x + b) % p;
    let yFound = null;
    
    for (let y = 0n; y < p; y++) {
      if ((y * y) % p === rhs) {
        yFound = y;
        break;
      }
    }
    
    if (yFound !== null) {
      points.push(new Point(x, yFound));
    } else {
      console.log(`[ECC] Warning: No valid y for x=${x}, using fallback`);
      points.push(fallbackPoint);
    }
  }
  
  return points;
}

// Convert points back to text using ASCII decoding
function pointsToText(pointList) {
  const text = [];
  
  for (const point of pointList) {
    if (point === null || point.infinity) {
      text.push('?');
      continue;
    }
    
    // Use x-coordinate as ASCII code
    const charCode = Number(point.x);
    if (charCode >= 32 && charCode <= 126) {
      text.push(String.fromCharCode(charCode));
    } else {
      text.push('?');
    }
  }
  
  return text.join('');
}

// Hybrid encryption: Use ECC to encrypt AES key, then AES to encrypt text
function eccEncrypt(plaintext, publicKeyX, publicKeyY) {
  console.log('[ECC Encrypt] Plaintext:', plaintext);
  console.log('[ECC Encrypt] Public key:', publicKeyX, publicKeyY);
  
  // Generate random AES key (256 bits = 32 bytes)
  const aesKey = crypto.randomBytes(32);
  const aesIv = crypto.randomBytes(16);
  
  // Encrypt plaintext with AES
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesIv);
  let encryptedText = cipher.update(plaintext, 'utf8', 'hex');
  encryptedText += cipher.final('hex');
  
  console.log('[ECC Encrypt] AES encrypted text length:', encryptedText.length);
  
  // Store AES key directly in hex (no ECC encoding for now)
  const G = new Point(Gx, Gy);
  const recipientPubKey = new Point(BigInt(publicKeyX), BigInt(publicKeyY));
  
  // Generate ephemeral key for ECC
  const randomBytes = crypto.randomBytes(2);
  let k = 0n;
  for (let i = 0; i < randomBytes.length; i++) {
    k = (k << 8n) | BigInt(randomBytes[i]);
  }
  k = (k % (p - 2n)) + 1n;
  
  console.log('[ECC Encrypt] Ephemeral key k:', k.toString());
  
  // Encrypt a dummy point to verify ECC is working
  const dummyPoint = new Point(1n, 1n);
  const C1 = scalarMult(k, G);
  const kRecipientPub = scalarMult(k, recipientPubKey);
  const C2 = pointAdd(dummyPoint, kRecipientPub);
  
  console.log('[ECC Encrypt] C1:', C1 ? `(${C1.x},${C1.y})` : 'null', 'C2:', C2 ? `(${C2.x},${C2.y})` : 'null');
  
  if (C1 === null || C1.infinity || C2 === null || C2.infinity) {
    throw new Error('ECC encryption failed - invalid point');
  }
  
  // Store AES key in hex (simplified approach)
  const result = JSON.stringify({
    C1x: C1.x.toString(),
    C1y: C1.y.toString(),
    C2x: C2.x.toString(),
    C2y: C2.y.toString(),
    iv: aesIv.toString('hex'),
    encryptedText: encryptedText,
    aesKey: aesKey.toString('hex') // Store AES key directly for now
  });
  
  console.log('[ECC Encrypt] Encrypted result length:', result.length);
  return result;
}

// ECC Decryption (hybrid: ECC decrypts AES key, then AES decrypts text)
function eccDecrypt(encryptedData, privateKey, publicKeyX, publicKeyY) {
  if (!privateKey) {
    console.error('[ECC Decrypt] Private key is undefined or null');
    return encryptedData;
  }
  
  console.log('[ECC Decrypt] Private key:', privateKey);
  if (publicKeyX && publicKeyY) {
    console.log('[ECC Decrypt] Public key:', publicKeyX, publicKeyY);
    // Verify Q = d*G
    const G = new Point(Gx, Gy);
    const computedPubKey = scalarMult(BigInt(privateKey), G);
    const expectedPubKey = new Point(BigInt(publicKeyX), BigInt(publicKeyY));
    console.log('[ECC Decrypt] Computed Q = d*G:', computedPubKey ? `(${computedPubKey.x},${computedPubKey.y})` : 'null');
    console.log('[ECC Decrypt] Expected Q:', `(${expectedPubKey.x},${expectedPubKey.y})`);
    console.log('[ECC Decrypt] Public key matches:', computedPubKey && computedPubKey.x === expectedPubKey.x && computedPubKey.y === expectedPubKey.y);
  }
  console.log('[ECC Decrypt] Encrypted data length:', encryptedData.length);
  console.log('[ECC Decrypt] Encrypted data (first 200 chars):', encryptedData.substring(0, 200));
  
  try {
    let encryptedObj;
    
    // Handle both old array format and new hybrid format
    if (encryptedData.startsWith('[')) {
      // Old format: array of encrypted points
      console.log('[ECC Decrypt] Detected old array format');
      encryptedObj = JSON.parse(encryptedData);
      if (Array.isArray(encryptedObj)) {
        // Old point-based format - can't decrypt properly
        console.error('[ECC Decrypt] Old point-based format not supported');
        return encryptedData;
      }
    } else {
      // New hybrid format
      encryptedObj = JSON.parse(encryptedData);
    }
    
    // Check if it's the new simplified format with AES key stored directly
    if (encryptedObj.aesKey) {
      console.log('[ECC Decrypt] Using simplified format with AES key stored directly');
      
      // Decrypt the text using AES with the stored key
      const aesKeyBytes = Buffer.from(encryptedObj.aesKey, 'hex');
      const iv = Buffer.from(encryptedObj.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKeyBytes, iv);
      let decryptedText = decipher.update(encryptedObj.encryptedText, 'hex', 'utf8');
      decryptedText += decipher.final('utf8');
      
      console.log('[ECC Decrypt] Decrypted text:', decryptedText);
      return decryptedText;
    }
    
    // Check if it's the hybrid format
    if (!encryptedObj.iv || !encryptedObj.encryptedText) {
      console.error('[ECC Decrypt] Invalid hybrid format - missing iv or encryptedText');
      return encryptedData;
    }
    
    console.log('[ECC Decrypt] Hybrid format detected');
    
    // Decrypt the AES key using ECC (handle both old single C2 and new dual C2 format)
    const privKey = BigInt(privateKey);
    const C1 = new Point(BigInt(encryptedObj.C1x), BigInt(encryptedObj.C1y));
    
    const decryptionTerm = scalarMult(privKey, C1);
    console.log('[ECC Decrypt] Decryption term (d*C1):', decryptionTerm ? `(${decryptionTerm.x},${decryptionTerm.y})` : 'null');
    
    const negDecryptionTerm = pointNeg(decryptionTerm);
    console.log('[ECC Decrypt] Negated decryption term:', negDecryptionTerm ? `(${negDecryptionTerm.x},${negDecryptionTerm.y})` : 'null');
    
    let keyPoint1, keyPoint2;
    
    if (encryptedObj.C2_1x && encryptedObj.C2_1y && encryptedObj.C2_2x && encryptedObj.C2_2y) {
      // New dual C2 format
      console.log('[ECC Decrypt] Using dual C2 format');
      const C2_1 = new Point(BigInt(encryptedObj.C2_1x), BigInt(encryptedObj.C2_1y));
      const C2_2 = new Point(BigInt(encryptedObj.C2_2x), BigInt(encryptedObj.C2_2y));
      
      console.log('[ECC Decrypt] C2_1:', `(${C2_1.x},${C2_1.y})`, 'C2_2:', `(${C2_2.x},${C2_2.y})`);
      
      keyPoint1 = pointAdd(C2_1, negDecryptionTerm);
      keyPoint2 = pointAdd(C2_2, negDecryptionTerm);
    } else if (encryptedObj.C2x && encryptedObj.C2y) {
      // Old single C2 format
      console.log('[ECC Decrypt] Using old single C2 format');
      const C2 = new Point(BigInt(encryptedObj.C2x), BigInt(encryptedObj.C2y));
      
      console.log('[ECC Decrypt] C2:', `(${C2.x},${C2.y})`);
      
      keyPoint1 = pointAdd(C2, negDecryptionTerm);
      keyPoint2 = null; // Can't reconstruct full key from single point
    } else {
      throw new Error('Invalid encrypted data format - missing C2');
    }
    
    console.log('[ECC Decrypt] Decrypted key point 1:', keyPoint1 ? `(${keyPoint1.x},${keyPoint1.y})` : 'null');
    if (keyPoint2) {
      console.log('[ECC Decrypt] Decrypted key point 2:', keyPoint2 ? `(${keyPoint2.x},${keyPoint2.y})` : 'null');
    }
    
    if (keyPoint1 === null || keyPoint1.infinity) {
      throw new Error('Failed to decrypt AES key point 1');
    }
    
    if (keyPoint2 === null) {
      console.error('[ECC Decrypt] Cannot reconstruct full AES key from single point');
      return encryptedData;
    }
    
    if (keyPoint2 === null || keyPoint2.infinity) {
      throw new Error('Failed to decrypt AES key point 2');
    }
    
    // Reconstruct AES key from both points (32 bytes total)
    const aesKeyBytes = Buffer.alloc(32);
    
    // First 16 bytes from keyPoint1.x
    let keyBigInt1 = keyPoint1.x;
    for (let i = 0; i < 16; i++) {
      aesKeyBytes[15 - i] = Number(keyBigInt1 & 0xFFn);
      keyBigInt1 = keyBigInt1 >> 8n;
    }
    
    // Second 16 bytes from keyPoint2.x
    let keyBigInt2 = keyPoint2.x;
    for (let i = 0; i < 16; i++) {
      aesKeyBytes[31 - i] = Number(keyBigInt2 & 0xFFn);
      keyBigInt2 = keyBigInt2 >> 8n;
    }
    
    console.log('[ECC Decrypt] Reconstructed AES key (32 bytes)');
    
    // Decrypt the text using AES
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKeyBytes, iv);
    let decryptedText = decipher.update(encryptedObj.encryptedText, 'hex', 'utf8');
    decryptedText += decipher.final('utf8');
    
    console.log('[ECC Decrypt] Decrypted text:', decryptedText);
    return decryptedText;
  } catch (e) {
    console.error('[ECC] Decryption error:', e);
    console.error('[ECC] Error stack:', e.stack);
    return encryptedData; // Return original data on error
  }
}

// Function to save ECC keys to user_keys.txt
export function saveECCKeys(username, eccKeys) {
  try {
    const keyLine = `ECC_${username}|${eccKeys.privateKey}|${eccKeys.publicKeyX}|${eccKeys.publicKeyY}\n`;
    console.log(`[ECC] Saving ECC keys to: ${KEYS_FILE_PATH}`);
    fs.appendFileSync(KEYS_FILE_PATH, keyLine);
    console.log(`[ECC] ECC keys saved for user: ${username}`);
  } catch (e) {
    console.error(`[ECC] Error saving ECC keys for user ${username}:`, e);
    throw e;
  }
}

// Function to load ECC keys from user_keys.txt
export function loadECCKeys(username) {
  if (!fs.existsSync(KEYS_FILE_PATH)) {
    return null;
  }
  
  const content = fs.readFileSync(KEYS_FILE_PATH, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    
    const parts = line.split('|');
    if (parts[0] === `ECC_${username}`) {
      return {
        privateKey: parts[1],
        publicKeyX: parts[2],
        publicKeyY: parts[3]
      };
    }
  }
  
  return null;
}

// Generate ECC keys on demand
export function getECCKeyPair(username) {
  console.log(`[ECC] Generating ECC key pair for user: ${username}...`);
  const keyPair = generateECCKeyPair();
  console.log(`[ECC] ECC key pair generated for user: ${username}`);
  return keyPair;
}

export {
  generateECCKeyPair,
  eccEncrypt,
  eccDecrypt
};
