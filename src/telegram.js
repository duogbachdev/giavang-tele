import TelegramBot from 'node-telegram-bot-api';

let bot = null;

export function initBot(token) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  // polling: false vi day la bot 1 chieu (chi gui di)
  bot = new TelegramBot(token, { polling: false });
  return bot;
}

export async function sendMessage(chatId, text) {
  if (!bot) throw new Error('Bot chua khoi tao. Goi initBot truoc.');
  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return true;
  } catch (err) {
    console.error('[Telegram] Send error:', err.message);
    // Thu lai voi plain text neu loi parse Markdown
    if (err.message.includes('parse')) {
      try {
        await bot.sendMessage(chatId, text);
        return true;
      } catch (e) {
        console.error('[Telegram] Plain send error:', e.message);
      }
    }
    return false;
  }
}
