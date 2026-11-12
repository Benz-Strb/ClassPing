// เปิด Expo ผ่าน Cloudflare tunnel ให้มือถือเครื่องไหนก็สแกน QR ได้ ไม่ต้องอยู่ Wi-Fi เดียวกัน
// ต้องเปิด dev:api ไว้ด้วย แอปเรียก API ผ่าน /api ของ Metro (ดู metro.config.js)
import { spawn } from 'node:child_process';

const PORT = process.env.SHARE_PORT ?? '8082';
// บริการ tunnel ฟรีของ Cloudflare ตอบช้าเป็นพัก ๆ ขอไม่ทันก็ลองใหม่เอง
const ATTEMPTS = 3;
const RETRY_MS = 3000;
// ใช้ HTTP/2 ผ่าน TCP 443 แทน QUIC (UDP 7844) ที่ Wi-Fi หลายที่บล็อก ไม่งั้นได้ลิงก์แต่ต่อไม่ติด (Error 1033)
const PROTOCOL = process.env.SHARE_PROTOCOL ?? 'http2';
// ได้ลิงก์แล้วแต่ยังต่อเข้า Cloudflare ไม่ติดภายในเวลานี้ ถือว่าไม่สำเร็จ
const CONNECT_MS = 30_000;
const children = new Set();
let started = false;

function stop() {
  for (const child of children) child.kill();
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function startExpo(url) {
  started = true;
  console.log(`tunnel: ${url}`);
  const expo = spawn('npx', ['expo', 'start', '--port', PORT], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
  });
  children.add(expo);
  expo.on('exit', () => stop());
}

function openTunnel(attempt) {
  const tunnel = spawn('cloudflared', [
    'tunnel', '--no-autoupdate', '--protocol', PROTOCOL, '--url', `http://localhost:${PORT}`,
  ]);
  children.add(tunnel);
  let url = null;
  let timer = null;
  // เก็บ log ล่าสุดของ cloudflared ไว้บอกสาเหตุตอนเปิด tunnel ไม่สำเร็จ
  const recent = [];

  tunnel.on('error', () => {
    console.error('ไม่เจอ cloudflared ติดตั้งก่อน: brew install cloudflared');
    process.exit(1);
  });
  tunnel.on('exit', (code) => {
    children.delete(tunnel);
    clearTimeout(timer);
    if (started) return stop();
    const requestFailed = recent.some(
      (line) => line.includes('failed to request quick Tunnel') || line.includes('ยังต่อไม่ติด'),
    );
    if (requestFailed && attempt < ATTEMPTS) {
      console.error(`ขอ tunnel ไม่สำเร็จ (ครั้งที่ ${attempt}/${ATTEMPTS}) ลองใหม่ใน ${RETRY_MS / 1000} วิ...`);
      setTimeout(() => openTunnel(attempt + 1), RETRY_MS);
      return;
    }
    console.error(`เปิด tunnel ไม่สำเร็จ (cloudflared จบด้วยรหัส ${code}) log ล่าสุด:`);
    for (const line of recent) console.error(`  ${line}`);
    console.error('ถ้ามือถืออยู่ Wi-Fi เดียวกับเครื่องนี้ ใช้ npm run dev:mobile แทนได้');
    stop();
  });

  tunnel.stderr.on('data', (chunk) => {
    const text = String(chunk);
    recent.push(...text.split('\n').filter(Boolean));
    recent.splice(0, Math.max(0, recent.length - 15));
    // api.trycloudflare.com คือที่ cloudflared ขอ tunnel (โผล่ใน log ตอนขอไม่สำเร็จ) ไม่ใช่ลิงก์ของเรา
    url ??= text
      .match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g)
      ?.find((u) => u !== 'https://api.trycloudflare.com') ?? null;
    if (url && !timer && !started) {
      console.log(`ได้ลิงก์ ${url} รอต่อเข้า Cloudflare...`);
      timer = setTimeout(() => {
        recent.push(`ได้ลิงก์แล้วแต่ยังต่อไม่ติดใน ${CONNECT_MS / 1000} วิ`);
        tunnel.kill();
      }, CONNECT_MS);
    }
    // ลิงก์ใช้ได้จริงเมื่อ cloudflared ต่อเข้า Cloudflare แล้วเท่านั้น
    if (url && !started && /Registered tunnel connection/.test(text)) {
      clearTimeout(timer);
      startExpo(url);
    }
  });
}

openTunnel(1);
