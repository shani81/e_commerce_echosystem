// Generate a dev RS256 keypair for signing/verifying AICOS access tokens.
// Writes PEM files into <repo>/.keys/ (gitignored). Idempotent unless --force.
// For CI/prod, set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY (the base64 lines printed
// below) instead of shipping the files.
//
//   pnpm keys:gen            # generate if missing
//   pnpm keys:gen --force    # regenerate (rotates the dev keys)
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), '.keys');
const privPath = resolve(dir, 'jwt_access_private.pem');
const pubPath = resolve(dir, 'jwt_access_public.pem');
const force = process.argv.includes('--force');

if (!force && existsSync(privPath) && existsSync(pubPath)) {
  console.log('✓ JWT keys already present in .keys/ (use `pnpm keys:gen --force` to rotate).');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(dir, { recursive: true });
writeFileSync(privPath, privateKey, { mode: 0o600 });
writeFileSync(pubPath, publicKey);

console.log('✓ Generated RS256 keypair:');
console.log('    .keys/jwt_access_private.pem');
console.log('    .keys/jwt_access_public.pem');
console.log('');
console.log('For CI/prod, set these env vars instead (base64, single line):');
console.log('  JWT_PRIVATE_KEY=' + Buffer.from(privateKey).toString('base64'));
console.log('  JWT_PUBLIC_KEY=' + Buffer.from(publicKey).toString('base64'));
