// launcher.js — Workaround for Electron 28 module resolution issue
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const stubPath = path.join(__dirname, 'node_modules', 'electron', 'index.js');
const backupPath = stubPath + '.bak';
const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

// 1. Move npm stub out of the way
fs.renameSync(stubPath, backupPath);

// 2. Launch Electron directly (bypasses node/npx which need the stub)
const child = spawn(electronExe, ['.'], {
  stdio: 'inherit',
  cwd: __dirname
});

// 3. Restore stub when done
child.on('exit', () => {
  try { fs.renameSync(backupPath, stubPath); } catch(e) {}
  process.exit(child.exitCode || 0);
});

child.on('error', (err) => {
  try { fs.renameSync(backupPath, stubPath); } catch(e) {}
  console.error('Error:', err.message);
  process.exit(1);
});

// Also restore on SIGINT
process.on('SIGINT', () => {
  try { fs.renameSync(backupPath, stubPath); } catch(e) {}
  process.exit();
});
