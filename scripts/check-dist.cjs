const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(process.cwd(), 'dist/index.cjs');
if (!fs.existsSync(target)) {
  console.error('dist/index.cjs is missing');
  process.exit(1);
}
const size = fs.statSync(target).size;
if (size < 1000) {
  console.error('dist/index.cjs looks too small');
  process.exit(1);
}
console.log(`dist/index.cjs OK (${size} bytes)`);
