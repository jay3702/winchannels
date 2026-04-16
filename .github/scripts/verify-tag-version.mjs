import fs from 'node:fs';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCargoVersion(filePath) {
  const cargo = fs.readFileSync(filePath, 'utf8');
  const packageSection = cargo.match(/\[package\][\s\S]*?(?=\n\[|$)/);
  if (!packageSection) return null;
  const match = packageSection[0].match(/^version\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

const tagRaw = String(process.env.GITHUB_REF_NAME || '').trim();
const tagVersion = tagRaw.replace(/^v/, '');

if (!tagVersion) {
  throw new Error('Missing GITHUB_REF_NAME; cannot verify tag version');
}

const versions = [
  ['package.json', readJson('package.json').version],
  ['src-tauri/tauri.conf.json', readJson('src-tauri/tauri.conf.json').version],
  ['src-tauri/Cargo.toml', readCargoVersion('src-tauri/Cargo.toml')],
];

const mismatches = versions.filter(([, v]) => v !== tagVersion);
if (mismatches.length > 0) {
  const details = mismatches.map(([f, v]) => `${f}=${v ?? 'null'}`).join(', ');
  throw new Error(`Tag version mismatch: ${details}; expected ${tagVersion}`);
}

console.log(`Version check passed for tag ${tagRaw} (${tagVersion})`);
