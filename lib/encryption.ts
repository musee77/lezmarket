import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    if (Buffer.from(key, 'hex').length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 32-byte hex string');
    }
    return key;
}

/**
 * Encrypts a plain text string using AES-256-GCM.
 * @param text The text to encrypt
 * @returns A string containing the IV, authTag, and encrypted text in hex format
 */
export function encrypt(text: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted string.
 * @param encryptedText The formatted encrypted string (iv:authTag:encrypted)
 * @returns The decrypted plain text
 */
export function decrypt(encryptedText: string): string {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) {
            // If it's not formatted correctly, it might be an old plain-text token
            // Return as is or throw depending on policy. For security, we throw.
            throw new Error('Invalid encrypted text format');
        }

        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error: any) {
        console.error('Decryption failed:', error.message);
        throw new Error('Could not decrypt sensitive data. The encryption key might be incorrect or the data is not encrypted.');
    }
}
