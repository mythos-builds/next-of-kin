// Overlays upstream PR #4 (github.com/solidcash/solidcash/pull/4, "a stateful call sets its master input's nSequence
// for this.age") on @solidcash/solidcash 0.51.1. Without it, `this.age` cannot be satisfied in a stateful call, and
// NextOfKin's clock depends on it. The files in vendor/pr4-overlay are that PR's changed src/stateful/*.ts, transpiled
// with esbuild against 0.51.1 (MIT, see vendor/pr4-overlay/LICENSE). Runs after every npm install; idempotent.
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'node_modules/@solidcash/solidcash');
if (!existsSync(pkg)) process.exit(0);
const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
if (version !== '0.51.1') {
  console.warn(`apply-pr4: @solidcash/solidcash is ${version}, overlay is for 0.51.1: skipped (check that PR #4 is in).`);
  process.exit(0);
}
const from = join(root, 'vendor/pr4-overlay');
const files = readdirSync(from).filter((f) => f.endsWith('.js'));
for (const f of files) copyFileSync(join(from, f), join(pkg, 'dist/stateful', f));
console.log(`apply-pr4: ${files.length} files of PR #4 applied to @solidcash/solidcash ${version}.`);
