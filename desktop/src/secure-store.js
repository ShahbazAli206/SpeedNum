"use strict";

/**
 * Local secrets (the refresh token, the backup encryption password) never
 * touch disk in plaintext. Electron's `safeStorage` hands off to the OS's
 * own credential store — DPAPI on Windows, Keychain on macOS, libsecret/
 * kwallet on Linux — so the encryption key itself is never something this
 * app manages; only the OS user account that's logged in can decrypt.
 *
 * Session credentials for the *SpidNums backend* work the same way here as
 * everywhere else in this codebase: a short-lived access token kept in
 * memory only, and a refresh token that's the one thing worth protecting
 * at rest, since it's what a stolen laptop file would actually be able to
 * use.
 */

const fs = require("fs");
const path = require("path");

function makeSecureStore(userDataDir) {
  const filePath = path.join(userDataDir, "secure.bin");

  return {
    async save(plaintextObject) {
      const { safeStorage } = require("electron");
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("OS secure storage is not available on this machine.");
      }
      const encrypted = safeStorage.encryptString(JSON.stringify(plaintextObject));
      await fs.promises.mkdir(userDataDir, { recursive: true });
      await fs.promises.writeFile(filePath, encrypted);
    },

    async load() {
      const { safeStorage } = require("electron");
      try {
        const encrypted = await fs.promises.readFile(filePath);
        if (!safeStorage.isEncryptionAvailable()) return null;
        return JSON.parse(safeStorage.decryptString(encrypted));
      } catch (err) {
        if (err.code === "ENOENT") return null;
        throw err;
      }
    },

    async clear() {
      await fs.promises.rm(filePath, { force: true });
    },
  };
}

module.exports = { makeSecureStore };
