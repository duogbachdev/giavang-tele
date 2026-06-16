import 'dotenv/config';
import http from 'http';
import { fetchSJC } from './sources/sjc.js';
import { fetchDOJI } from './sources/doji.js';
import { fetchPNJ } from './sources/pnj.js';
import { fetchBTMC } from './sources/btmc.js';
import { initBot, processWebhook, sendMessage, stopBot } from './telegram.js';
import { formatMessage, diffSnapshots } from './formatter.js';
import {
  addSubscriber,
  getSubscriberChatIds,
  initSubscribers,
  listSubscribers,
  removeSubscriber
} from './subscribers.js';

const renderWebhookUrl = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : process.env.RENDER_EXTERNAL_URL
    || (process.env.RENDER_SERVICE_NAME ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com` : null);

const config = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  intervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '300000', 10),
  notifyOnChangeOnly: process.env.NOTIFY_ON_CHANGE_ONLY !== 'false',
  periodicEvery: parseInt(process.env.PERIODIC_REPORT_EVERY || '12', 10),
  sources: (process.env.SOURCES || 'sjc,doji,pnj,btmc').split(',').map(s => s.trim()),
  port: parseInt(process.env.PORT || '3000', 10),
  webhookBaseUrl: process.env.TELEGRAM_WEBHOOK_URL || renderWebhookUrl,
  seedSubscriberIds: [process.env.TELEGRAM_CHAT_ID, process.env.SUBSCRIBER_CHAT_IDS]
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

const helpMessage = `*BOT GIA VANG*

| Lenh | Tac dung |
|---|---|
| /gia | Xem gia vang hien tai |
| /start | Dang ky nhan thong bao tu dong |
| /stop | Huy nhan thong bao tu dong |
| /help | Xem huong dan |

Bot se tu dong gui thong bao khi gia thay doi hoac den lich bao cao dinh ky.`;

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

  if (command === '/start') {
    const { existed } = await addSubscriber(message.chat);
    await sendMessage(chatId, existed
      ? `${helpMessage}\n\n_Ban da co trong danh sach nhan thong bao._`
      : `${helpMessage}\n\n_Da dang ky nhan thong bao tu dong._`);
    return;
  }

  if (command === '/help') {
    await sendMessage(chatId, helpMessage);
    return;
  }

  if (command === '/stop') {
    const existed = await removeSubscriber(chatId);
    await sendMessage(chatId, existed
      ? 'Da huy nhan thong bao tu dong. Gui /start de dang ky lai.'
      : 'Chat nay chua co trong danh sach nhan thong bao. Gui /start de dang ky.');
    return;
  }

  if (command === '/subscribers') {
    if (String(chatId) !== String(config.chatId)) {
      await sendMessage(chatId, 'Lenh nay chi danh cho admin.');
      return;
    }
    const rows = listSubscribers();
    const body = rows.length
      ? rows.map((row, index) => `${index + 1}. ${row.title} (${row.chatId})`).join('\n')
      : 'Chua co subscriber nao.';
    await sendMessage(chatId, `*DANH SACH NHAN THONG BAO*\n\n${body}`);
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
    await sendMessage(chatId, 'Gui /gia de xem gia vang hien tai, /start de nhan thong bao tu dong.');
  }
}

async function sendToSubscribers(text) {
  const chatIds = getSubscriberChatIds();
  const results = await Promise.allSettled(chatIds.map(chatId => sendMessage(chatId, text)));
  const okCount = results.filter(result => result.status === 'fulfilled' && result.value).length;
  console.log(`[Telegram] Da gui ${okCount}/${chatIds.length} subscriber`);
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
    await sendToSubscribers(msg);
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
        intervalMs: config.intervalMs,
        subscriberCount: getSubscriberChatIds().length
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
  await initSubscribers(config.seedSubscriberIds);
  await initBot(config.token, handleTelegramMessage, config.webhookBaseUrl);

  console.log('[Boot] Cau hinh:', {
    sources: config.sources,
    intervalMs: config.intervalMs,
    notifyOnChangeOnly: config.notifyOnChangeOnly,
    periodicEvery: config.periodicEvery,
    subscriberCount: getSubscriberChatIds().length,
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
