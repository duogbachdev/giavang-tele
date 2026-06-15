import axios from 'axios';
import * as cheerio from 'cheerio';

let fallbackApiKey = null;

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

async function fetchSJCMirror() {
  const res = await axios.get('https://giavang.org/trong-nuoc/sjc/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldPriceBot/1.0)' },
    timeout: 10000
  });
  const $ = cheerio.load(res.data);
  let item = null;

  $('table').first().find('tr').each((_, element) => {
    if (item) return;
    const cells = $(element).find('td').map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 3 || !normalize(cells[0]).includes('VANG SJC 1L')) return;

    const buy = parseFloat(cells[cells.length - 2].replace(/[,.]/g, '')) || 0;
    const sell = parseFloat(cells[cells.length - 1].replace(/[,.]/g, '')) || 0;
    if (buy > 0 && sell > 0) {
      item = { name: 'Vang mieng SJC 1 luong', buy: buy * 1000, sell: sell * 1000 };
    }
  });

  if (!item) throw new Error('khong tim thay bang gia');
  return {
    source: 'SJC',
    items: [item],
    updatedAt: new Date().toISOString()
  };
}

async function fetchSJCFallback() {
  if (!fallbackApiKey) {
    const keyRes = await axios.get('https://api.vnappmob.com/api/request_api_key?scope=gold', {
      timeout: 15000
    });
    fallbackApiKey = keyRes.data?.results;
  }

  try {
    const res = await axios.get('https://api.vnappmob.com/api/v2/gold/sjc', {
      headers: { Authorization: `Bearer ${fallbackApiKey}` },
      timeout: 15000
    });
    const price = res.data?.results?.[0];
    if (!price) throw new Error('khong co du lieu gia');

    return {
      source: 'SJC',
      items: [{
        name: 'Vang mieng SJC 1 luong',
        buy: parseFloat(price.buy_1l),
        sell: parseFloat(price.sell_1l)
      }],
      updatedAt: price.datetime
        ? new Date(parseInt(price.datetime, 10) * 1000).toISOString()
        : new Date().toISOString()
    };
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      fallbackApiKey = null;
    }
    throw err;
  }
}

export async function fetchSJC() {
  try {
    return await fetchSJCMirror();
  } catch (err) {
    console.warn('[SJC] Mirror error:', err.message, '- dung API du phong');
    try {
      return await fetchSJCFallback();
    } catch (fallbackErr) {
      console.error('[SJC] Fallback API error:', fallbackErr.message);
      return null;
    }
  }
}
