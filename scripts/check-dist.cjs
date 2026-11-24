const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');

const root = process.cwd();
const target = path.join(root, 'dist/index.cjs');
const temp = path.join(os.tmpdir(), `repo-arbiter-dist-check-${process.pid}.cjs`);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

try {
  if (!fs.existsSync(target)) {
    console.error('dist/index.cjs is missing');
    process.exit(1);
  }

  esbuild.buildSync({
    entryPoints: [path.join(root, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    outfile: temp,
    legalComments: 'eof',
  });

  const expected = sha256(temp);
  const actual = sha256(target);
  if (expected !== actual) {
    console.error('dist/index.cjs is stale; run npm run build and commit dist/index.cjs');
    process.exit(1);
  }

  console.log(`dist/index.cjs is fresh (${fs.statSync(target).size} bytes)`);
} finally {
  if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
}
