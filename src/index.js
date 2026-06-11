import 'dotenv/config';
import http from 'http';
import { fetchSJC } from './sources/sjc.js';
import { fetchDOJI } from './sources/doji.js';
import { fetchPNJ } from './sources/pnj.js';
import { fetchBTMC } from './sources/btmc.js';
import { initBot, sendMessage } from './telegram.js';
import { formatMessage, diffSnapshots } from './formatter.js';

const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '300000', 10),
  notifyOnChangeOnly: process.env.NOTIFY_ON_CHANGE_ONLY !== 'false',
  periodicEvery: parseInt(process.env.PERIODIC_REPORT_EVERY || '12', 10),
  sources: (process.env.SOURCES || 'sjc,doji,pnj,btmc').split(',').map(s => s.trim()),
  port: parseInt(process.env.PORT || '3000', 10)
};

const fetchers = {
  sjc: fetchSJC,
  doji: fetchDOJI,
  pnj: fetchPNJ,
  btmc: fetchBTMC
};

let prevSnapshots = null;
let scanCount = 0;
let lastScanAt = null;
let lastError = null;

async function scanAll() {
  const tasks = config.sources
    .filter(s => fetchers[s])
    .map(s => fetchers[s]());
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

async function tick() {
  scanCount++;
  console.log(`\n[Scan #${scanCount}] ${new Date().toISOString()}`);

  let snapshots;
  try {
    snapshots = await scanAll();
  } catch (err) {
    lastError = err.message;
    console.error('[Scan] Error:', err.message);
    return;
  }

  if (snapshots.length === 0) {
    console.warn('[Scan] Khong lay duoc du lieu tu nguon nao');
    return;
  }

  console.log(`[Scan] OK ${snapshots.length}/${config.sources.length} nguon`);
  lastScanAt = new Date().toISOString();
  lastError = null;

  const isPeriodic = config.periodicEvery > 0 && scanCount % config.periodicEvery === 0;
  const changes = diffSnapshots(prevSnapshots, snapshots);

  let shouldSend = false;
  if (scanCount === 1) {
    shouldSend = true; // lan dau khoi dong
  } else if (isPeriodic) {
    shouldSend = true;
  } else if (changes && config.notifyOnChangeOnly) {
    shouldSend = true;
  } else if (!config.notifyOnChangeOnly) {
    shouldSend = true;
  }

  if (shouldSend) {
    const msg = formatMessage(snapshots, { isPeriodic, changes });
    const ok = await sendMessage(config.chatId, msg);
    if (ok) console.log('[Telegram] Da gui');
  } else {
    console.log('[Scan] Khong co thay doi, bo qua');
  }

  prevSnapshots = snapshots;
}

// HTTP server cho Render health check
function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        scanCount,
        lastScanAt,
        lastError,
        sources: config.sources,
        intervalMs: config.intervalMs
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  server.listen(config.port, () => {
    console.log(`[HTTP] Health server listening on :${config.port}`);
  });
}

async function main() {
  if (!config.token || !config.chatId) {
    console.error('Thieu TELEGRAM_BOT_TOKEN hoac TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  initBot(config.token);
  startHealthServer();

  console.log('[Boot] Cau hinh:', {
    sources: config.sources,
    intervalMs: config.intervalMs,
    notifyOnChangeOnly: config.notifyOnChangeOnly,
    periodicEvery: config.periodicEvery
  });

  await tick();
  setInterval(tick, config.intervalMs);
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
