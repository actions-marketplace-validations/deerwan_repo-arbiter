const fs = require('node:fs');
const path = require('node:path');

const target = path.resolve(process.cwd(), 'dist/index.js');
if (!fs.existsSync(target)) {
  console.error('dist/index.js is missing');
  process.exit(1);
}
const size = fs.statSync(target).size;
if (size < 1000) {
  console.error('dist/index.js looks too small');
  process.exit(1);
}
console.log(`dist/index.js OK (${size} bytes)`);
