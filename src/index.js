import 'dotenv/config';
import http from 'http';
import { fetchSJC } from './sources/sjc.js';
import { fetchDOJI } from './sources/doji.js';
import { fetchPNJ } from './sources/pnj.js';
import { fetchBTMC } from './sources/btmc.js';
import { initBot, processWebhook, sendMessage, stopBot } from './telegram.js';
import { formatMessage, diffSnapshots } from './formatter.js';

const renderWebhookUrl = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : process.env.RENDER_EXTERNAL_URL;

const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '300000', 10),
  notifyOnChangeOnly: process.env.NOTIFY_ON_CHANGE_ONLY !== 'false',
  periodicEvery: parseInt(process.env.PERIODIC_REPORT_EVERY || '12', 10),
  sources: (process.env.SOURCES || 'sjc,doji,pnj,btmc').split(',').map(s => s.trim()),
  port: parseInt(process.env.PORT || '3000', 10),
  webhookBaseUrl: process.env.TELEGRAM_WEBHOOK_URL || renderWebhookUrl
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
let healthServer = null;

async function scanAll() {
  const tasks = config.sources
    .filter(s => fetchers[s])
    .map(s => fetchers[s]());
  const results = await Promise.all(tasks);
  return results.filter(Boolean);
}

async function handleTelegramMessage(message) {
  const text = message.text?.trim();
  if (!text) return;

  const chatId = message.chat.id;
  const command = text.split(/\s+/)[0].toLowerCase().split('@')[0];

  if (command === '/start' || command === '/help') {
    await sendMessage(chatId, '*BOT GIA VANG*\n\nGui /gia de xem gia vang hien tai.');
    return;
  }

  if (command === '/gia') {
    await sendMessage(chatId, '_Dang lay gia vang, vui long cho..._');
    try {
      const snapshots = await scanAll();
      if (snapshots.length === 0) {
        await sendMessage(chatId, 'Khong lay duoc du lieu gia vang luc nay.');
        return;
      }
      await sendMessage(chatId, formatMessage(snapshots, { isCurrent: true }));
    } catch (err) {
      console.error('[Telegram] /gia error:', err.message);
      await sendMessage(chatId, 'Khong lay duoc du lieu gia vang luc nay.');
    }
    return;
  }

  // Trong group chi phan hoi lenh, tranh bot tra loi moi tin nhan.
  if (message.chat.type === 'private') {
    await sendMessage(chatId, 'Gui /gia de xem gia vang hien tai.');
  }
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

  console.log(`[Scan] OK ${snapshots.length}/${config.sources.length} nguon: ${snapshots.map(s => s.source).join(', ')}`);
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
  healthServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url?.startsWith('/telegram-webhook/')) {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1024 * 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const handled = processWebhook(req.url, JSON.parse(body));
          res.writeHead(handled ? 200 : 404);
          res.end();
        } catch (err) {
          console.error('[Telegram] Webhook error:', err.message);
          res.writeHead(400);
          res.end();
        }
      });
      return;
    }

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
  healthServer.listen(config.port, () => {
    console.log(`[HTTP] Health server listening on :${config.port}`);
  });
}

async function shutdown(signal) {
  console.log(`[Shutdown] ${signal}`);
  await stopBot();
  healthServer?.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

async function main() {
  if (!config.token || !config.chatId) {
    console.error('Thieu TELEGRAM_BOT_TOKEN hoac TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  startHealthServer();
  await initBot(config.token, handleTelegramMessage, config.webhookBaseUrl);

  console.log('[Boot] Cau hinh:', {
    sources: config.sources,
    intervalMs: config.intervalMs,
    notifyOnChangeOnly: config.notifyOnChangeOnly,
    periodicEvery: config.periodicEvery,
    telegramMode: config.webhookBaseUrl ? 'webhook' : 'polling'
  });

  await tick();
  setInterval(tick, config.intervalMs);
}

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
