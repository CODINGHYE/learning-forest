const {existsSync} = require('node:fs');
const {resolve} = require('node:path');
const {spawnSync} = require('node:child_process');
const root = resolve(__dirname, '..');
const local = resolve(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
const candidates = process.env.FOREST_PYTHON ? [[process.env.FOREST_PYTHON, []]] :
  [...(existsSync(local) ? [[local, []]] : []), ...(process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]])];
for (const [python, prefix] of candidates) {
  if (spawnSync(python, [...prefix, '--version'], {stdio: 'ignore'}).status !== 0) continue;
  const result = spawnSync(python, [...prefix, resolve(__dirname, 'verify.py'), ...process.argv.slice(2)], {cwd: root, stdio: 'inherit'});
  process.exit(result.status ?? 1);
}
console.error('Python 3.11+ was not found. Set FOREST_PYTHON or install Python.');
process.exit(1);
