import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const modeIndex = args.indexOf('--mode');
const portIndex = args.indexOf('--port');
const mode = modeIndex >= 0 ? String(args[modeIndex + 1] || 'dev') : 'dev';
const port = portIndex >= 0 ? String(args[portIndex + 1] || '4519') : '4519';

function shouldAutostartTray() {
  return !/^(0|false|no)$/i.test(String(process.env.DASHBOARD_TRAY_AUTOSTART || '').trim());
}

if (process.platform !== 'win32' || !shouldAutostartTray()) {
  process.exit(0);
}

const root = process.cwd();
const psPath = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const trayScript = path.join(root, 'scripts', 'launcher-tray.ps1');
const psArgs = [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-STA',
  '-WindowStyle',
  'Hidden',
  '-File',
  trayScript,
  '-Mode',
  mode,
  '-Port',
  port,
  '-NoOpen',
  '-Attach'
];

try {
  const child = spawn(psPath, psArgs, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
} catch {
  // Do not block backend startup if tray fails.
}
