"use strict";

/**
 * Streaming authenticated encryption for local backup files (AES-256-GCM,
 * scrypt-derived key). Established primitives only — no invented crypto.
 *
 * File layout (so decrypting never needs to buffer the whole plaintext):
 *
 *   [4B magic "SNBK"][1B version][1B kdfId][16B salt][12B iv] -- header, 34B
 *   <ciphertext, streamed>
 *   [16B GCM auth tag]                                        -- footer
 *
 * The auth tag can only be known after every ciphertext byte has been
 * produced, so it goes at the end rather than the header. Decryption reads
 * the fixed-size header and footer directly (cheap random-access reads on
 * an already-fully-downloaded local file — this isn't streamed over the
 * network), then decrypts everything in between as one stream.
 *
 * The encryption key is never written anywhere: it's derived from a
 * user-supplied backup password + a random per-file salt via scrypt, and
 * exists only in memory for the duration of one encrypt/decrypt call.
 */

const crypto = require("crypto");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const MAGIC = Buffer.from("SNBK", "ascii");
const VERSION = 1;
const KDF_SCRYPT = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + 1 + SALT_LEN + IV_LEN; // 34
const KEY_LEN = 32; // AES-256

// scrypt cost parameters for kdfId=1. Fixed per version rather than stored
// per-file: if these ever need to change, that's a new kdfId, decodable
// without ambiguity from the header alone.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function deriveKey(password, salt) {
  return crypto.scryptSync(Buffer.from(password, "utf8"), salt, KEY_LEN, SCRYPT_PARAMS);
}

/**
 * Encrypts `inputPath` to `outputPath`. Streams the plaintext through the
 * cipher rather than loading it into memory — a MinIO storage archive
 * component can be large.
 */
async function encryptFile(inputPath, outputPath, password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const header = Buffer.concat([MAGIC, Buffer.from([VERSION, KDF_SCRYPT]), salt, iv]);

  const out = fs.createWriteStream(outputPath);
  await new Promise((resolve, reject) => {
    out.write(header, (err) => (err ? reject(err) : resolve()));
  });

  const input = fs.createReadStream(inputPath);
  await pipeline(input, cipher, out, { end: false });

  const tag = cipher.getAuthTag();
  await new Promise((resolve, reject) => {
    out.end(tag, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Decrypts an envelope produced by encryptFile. Throws (GCM tag mismatch)
 * on any tampering, truncation, or wrong password — there is no partial/
 * silent-corruption outcome; a bad decrypt always throws before any
 * plaintext byte is trusted, because Node's GCM implementation buffers the
 * final block until the tag is verified.
 */
async function decryptFile(inputPath, outputPath, password) {
  const { size } = await fs.promises.stat(inputPath);
  if (size < HEADER_LEN + TAG_LEN) {
    throw new Error("Backup file is too small to be a valid encrypted envelope.");
  }

  const fd = await fs.promises.open(inputPath, "r");
  try {
    const header = Buffer.alloc(HEADER_LEN);
    await fd.read(header, 0, HEADER_LEN, 0);
    if (!header.subarray(0, 4).equals(MAGIC)) {
      throw new Error("Not a SpeedNum backup file (bad magic).");
    }
    const version = header[4];
    const kdfId = header[5];
    if (version !== VERSION || kdfId !== KDF_SCRYPT) {
      throw new Error(`Unsupported backup envelope version/kdf: ${version}/${kdfId}.`);
    }
    const salt = header.subarray(6, 6 + SALT_LEN);
    const iv = header.subarray(6 + SALT_LEN, 6 + SALT_LEN + IV_LEN);

    const tag = Buffer.alloc(TAG_LEN);
    await fd.read(tag, 0, TAG_LEN, size - TAG_LEN);

    const key = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const bodyLength = size - HEADER_LEN - TAG_LEN;
    const out = fs.createWriteStream(outputPath);
    // Wrong password or any tampering surfaces here: setAuthTag + a
    // mismatched final block makes decipher.final() throw, which pipeline
    // (or the direct final() call below) propagates as a rejection —
    // nothing in outputPath is trustworthy unless this resolves.
    if (bodyLength <= 0) {
      // An empty plaintext has no ciphertext body — createReadStream's
      // start/end range would be invalid (start > end), and there's
      // nothing to stream anyway. final() alone still verifies the tag.
      const tail = decipher.final();
      await new Promise((resolve, reject) => {
        out.end(tail, (err) => (err ? reject(err) : resolve()));
      });
    } else {
      const input = fs.createReadStream(inputPath, {
        fd: fd.fd,
        start: HEADER_LEN,
        end: HEADER_LEN + bodyLength - 1,
        autoClose: false,
      });
      await pipeline(input, decipher, out);
    }
  } finally {
    await fd.close();
  }
}

module.exports = { encryptFile, decryptFile, HEADER_LEN, TAG_LEN, VERSION, KDF_SCRYPT };
