import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { registerSecret, containsSecret } from '../src/security.js';
registerSecret(process.env.DISCORD_TOKEN);
delete process.env.DISCORD_TOKEN;
const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', '.git', '.agents', '.codex', '.aws', 'data', 'coverage']);
const findings = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || excluded.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example') || entry.name.endsWith('.log')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.isFile() && containsSecret(readFileSync(path, 'utf8'))) findings.push(relative(root, path));
  }
}
scan(root);
if (findings.length) { console.error('Possible credential in files: ' + findings.join(', ') + '. Content hidden.'); process.exitCode = 1; }
else console.log('Check complete: no credentials detected in publishable files.');
