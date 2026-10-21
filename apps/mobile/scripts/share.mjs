// เปิด Expo ผ่าน Cloudflare tunnel ให้มือถือเครื่องไหนก็สแกน QR ได้ ไม่ต้องอยู่ Wi-Fi เดียวกัน
// ต้องเปิด dev:api ไว้ด้วย แอปเรียก API ผ่าน /api ของ Metro (ดู metro.config.js)
import { spawn } from 'node:child_process';

const PORT = process.env.SHARE_PORT ?? '8082';
const children = [];

function stop() {
  for (const child of children) child.kill();
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
children.push(tunnel);
tunnel.on('error', () => {
  console.error('ไม่เจอ cloudflared ติดตั้งก่อน: brew install cloudflared');
  process.exit(1);
});
tunnel.on('exit', () => stop());

let started = false;
tunnel.stderr.on('data', (chunk) => {
  const url = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url || started) return;
  started = true;
  console.log(`tunnel: ${url}`);
  const expo = spawn('npx', ['expo', 'start', '--port', PORT], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
  });
  children.push(expo);
  expo.on('exit', () => stop());
});
