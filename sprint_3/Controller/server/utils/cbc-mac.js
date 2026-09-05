import CryptoJS from 'crypto-js';

// Secret key for CBC-MAC (should be stored securely in environment variables)
const MAC_SECRET_KEY = process.env.MAC_SECRET_KEY || 'default-mac-secret-key-change-in-production';

/**
 * Generate CBC-MAC for a message
 * CBC-MAC works by encrypting the message in CBC mode with a fixed IV (usually 0)
 * and taking the last block as the MAC
 * 
 * @param {string} message - The message to authenticate
 * @returns {string} - The CBC-MAC as a hex string
 */
export function generateMAC(message) {
  if (!message) {
    throw new Error('Message is required for MAC generation');
  }
  
  // Convert message to UTF-8 bytes
  const messageBytes = CryptoJS.enc.Utf8.parse(message);
  
  // Use AES in CBC mode with zero IV for CBC-MAC
  const iv = CryptoJS.enc.Hex.parse('00000000000000000000000000000000');
  const key = CryptoJS.enc.Utf8.parse(MAC_SECRET_KEY);
  
  // Encrypt in CBC mode
  const encrypted = CryptoJS.AES.encrypt(messageBytes, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding
  });
  
  // The MAC is the ciphertext (last block)
  const mac = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  
  return mac;
}

/**
 * Verify CBC-MAC for a message
 * 
 * @param {string} message - The message to verify
 * @param {string} receivedMAC - The MAC received with the message
 * @returns {boolean} - True if MAC is valid, false otherwise
 */
export function verifyMAC(message, receivedMAC) {
  if (!message || !receivedMAC) {
    return false;
  }
  
  try {
    // Generate MAC for the received message
    const computedMAC = generateMAC(message);
    
    // Compare in constant time to prevent timing attacks
    return constantTimeCompare(computedMAC, receivedMAC);
  } catch (e) {
    console.error('[CBC-MAC] Error verifying MAC:', e);
    return false;
  }
}

/**
 * Constant-time comparison to prevent timing attacks
 * 
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} - True if strings are equal
 */
function constantTimeCompare(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
