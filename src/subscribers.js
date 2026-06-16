import fs from 'fs/promises';
import path from 'path';

const dataDir = path.resolve('data');
const subscribersFile = path.join(dataDir, 'subscribers.json');

let subscribers = new Map();

function normalizeChatId(chatId) {
  return String(chatId).trim();
}

function parseSeedChatIds(value) {
  return String(value || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

async function saveSubscribers() {
  await fs.mkdir(dataDir, { recursive: true });
  const rows = [...subscribers.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await fs.writeFile(subscribersFile, JSON.stringify(rows, null, 2));
}

export async function initSubscribers(seedChatIds = []) {
  try {
    const raw = await fs.readFile(subscribersFile, 'utf8');
    const rows = JSON.parse(raw);
    if (Array.isArray(rows)) {
      subscribers = new Map(rows.map(row => [normalizeChatId(row.chatId), {
        chatId: normalizeChatId(row.chatId),
        title: row.title || '',
        type: row.type || 'private',
        createdAt: row.createdAt || new Date().toISOString()
      }]));
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let changed = false;
  for (const chatId of seedChatIds.flatMap(parseSeedChatIds)) {
    const id = normalizeChatId(chatId);
    if (!subscribers.has(id)) {
      subscribers.set(id, {
        chatId: id,
        title: 'Default chat',
        type: 'configured',
        createdAt: new Date().toISOString()
      });
      changed = true;
    }
  }

  if (changed) await saveSubscribers();
}

export async function addSubscriber(chat) {
  const chatId = normalizeChatId(chat.id);
  const title = chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || 'Unknown';
  const existed = subscribers.has(chatId);

  subscribers.set(chatId, {
    chatId,
    title,
    type: chat.type || 'private',
    createdAt: subscribers.get(chatId)?.createdAt || new Date().toISOString()
  });
  await saveSubscribers();

  return { existed, subscriber: subscribers.get(chatId) };
}

export async function removeSubscriber(chatId) {
  const id = normalizeChatId(chatId);
  const existed = subscribers.delete(id);
  if (existed) await saveSubscribers();
  return existed;
}

export function listSubscribers() {
  return [...subscribers.values()];
}

export function getSubscriberChatIds() {
  return [...subscribers.keys()];
}
