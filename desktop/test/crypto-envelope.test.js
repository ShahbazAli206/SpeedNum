"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const { encryptFile, decryptFile, HEADER_LEN, TAG_LEN } = require("../src/crypto-envelope");

function tmpFile(name) {
  return path.join(os.tmpdir(), `snbk-test-${crypto.randomBytes(6).toString("hex")}-${name}`);
}

async function withPlaintext(content, run) {
  const plain = tmpFile("plain.bin");
  const enc = tmpFile("enc.bin");
  const dec = tmpFile("dec.bin");
  await fs.promises.writeFile(plain, content);
  try {
    await run({ plain, enc, dec });
  } finally {
    for (const f of [plain, enc, dec]) await fs.promises.rm(f, { force: true });
  }
}

test("round trip: decrypted output matches the original plaintext exactly", async () => {
  const content = Buffer.from("SpeedNum disaster-recovery backup — some tenant data\n".repeat(500));
  await withPlaintext(content, async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "correct horse battery staple");
    await decryptFile(enc, dec, "correct horse battery staple");
    const result = await fs.promises.readFile(dec);
    assert.ok(result.equals(content));
  });
});

test("round trip works on an empty file", async () => {
  await withPlaintext(Buffer.alloc(0), async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "pw");
    await decryptFile(enc, dec, "pw");
    const result = await fs.promises.readFile(dec);
    assert.equal(result.length, 0);
  });
});

test("the wrong password is rejected, not silently decrypted into garbage", async () => {
  await withPlaintext(Buffer.from("secret tenant records"), async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "the-real-password");
    await assert.rejects(() => decryptFile(enc, dec, "a-different-password"));
  });
});

test("a single flipped ciphertext byte is detected, not silently accepted", async () => {
  await withPlaintext(Buffer.from("integrity matters here"), async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "pw");
    const bytes = await fs.promises.readFile(enc);
    // Flip a bit well inside the ciphertext body (past the header, before the tag).
    const target = HEADER_LEN + 3;
    bytes[target] ^= 0xff;
    await fs.promises.writeFile(enc, bytes);
    await assert.rejects(() => decryptFile(enc, dec, "pw"));
  });
});

test("a tampered auth tag is detected", async () => {
  await withPlaintext(Buffer.from("integrity matters here too"), async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "pw");
    const bytes = await fs.promises.readFile(enc);
    bytes[bytes.length - 1] ^= 0xff; // last byte of the appended auth tag
    await fs.promises.writeFile(enc, bytes);
    await assert.rejects(() => decryptFile(enc, dec, "pw"));
  });
});

test("a truncated file is rejected outright rather than throwing something obscure", async () => {
  await withPlaintext(Buffer.from("short"), async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "pw");
    const bytes = await fs.promises.readFile(enc);
    await fs.promises.writeFile(enc, bytes.subarray(0, HEADER_LEN)); // header only, no body/tag
    await assert.rejects(() => decryptFile(enc, dec, "pw"), /too small/);
  });
});

test("a file that isn't a SpeedNum envelope at all is rejected", async () => {
  const notOurs = tmpFile("plain.bin");
  const dec = tmpFile("dec.bin");
  await fs.promises.writeFile(notOurs, Buffer.alloc(HEADER_LEN + TAG_LEN + 10, 0x41));
  try {
    await assert.rejects(() => decryptFile(notOurs, dec, "pw"), /bad magic/);
  } finally {
    await fs.promises.rm(notOurs, { force: true });
    await fs.promises.rm(dec, { force: true });
  }
});

test("two files encrypted with the same password use different salts and produce different ciphertext", async () => {
  const content = Buffer.from("same plaintext both times");
  const plain = tmpFile("plain.bin");
  const enc1 = tmpFile("enc1.bin");
  const enc2 = tmpFile("enc2.bin");
  await fs.promises.writeFile(plain, content);
  try {
    await encryptFile(plain, enc1, "pw");
    await encryptFile(plain, enc2, "pw");
    const a = await fs.promises.readFile(enc1);
    const b = await fs.promises.readFile(enc2);
    assert.ok(!a.equals(b)); // random salt+iv each time, even for identical input+password
  } finally {
    for (const f of [plain, enc1, enc2]) await fs.promises.rm(f, { force: true });
  }
});

test("handles content larger than a single stream chunk (streaming, not buffer-everything)", async () => {
  const content = crypto.randomBytes(8 * 1024 * 1024); // 8MB, several chunks
  await withPlaintext(content, async ({ plain, enc, dec }) => {
    await encryptFile(plain, enc, "pw");
    await decryptFile(enc, dec, "pw");
    const result = await fs.promises.readFile(dec);
    assert.ok(result.equals(content));
  });
});
