#!/usr/bin/env node
/* Usage: node scripts/hash-password.js "the password"
   Prints the value for ADMIN_PASSWORD_HASH. */
const crypto = require('crypto');
const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error('Give a password of at least 12 characters.'); process.exit(1); }
const salt = crypto.randomBytes(16);
const iter = 310000;
const hash = crypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256');
console.log('pbkdf2$' + iter + '$' + salt.toString('base64url') + '$' + hash.toString('base64url'));
