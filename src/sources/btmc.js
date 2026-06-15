import axios from 'axios';
import * as cheerio from 'cheerio';

const wantedNames = [
  'VANG MIENG VRTL',
  'NHAN TRON',
  'VANG MIENG SJC',
  'TRANG SUC VANG RONG THANG LONG 999.9'
];

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function selectItems(rows, unitMultiplier) {
  const items = [];
  const seen = new Set();

  for (const row of rows) {
    const normalizedName = normalize(row.name);
    const matched = wantedNames.find(name => normalizedName.includes(name));
    if (!matched || seen.has(matched) || row.buy <= 0 || row.sell <= 0) continue;

    seen.add(matched);
    items.push({
      name: row.name,
      buy: row.buy * unitMultiplier,
      sell: row.sell * unitMultiplier
    });
  }

  return items;
}

async function fetchBTMCWebsite() {
  const res = await axios.get('https://btmc.vn/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldPriceBot/1.0)' },
    timeout: 15000
  });
  const $ = cheerio.load(res.data);
  const rows = [];

  $('table').first().find('tr').each((_, element) => {
    const cells = $(element).find('td').map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 4) return;

    const buy = parseFloat(cells[cells.length - 2].replace(/[,.]/g, '')) || 0;
    const sell = parseFloat(cells[cells.length - 1].replace(/[,.]/g, '')) || 0;
    rows.push({ name: cells.slice(0, cells.length - 3).join(' ').trim(), buy, sell });
  });

  return selectItems(rows, 10000);
}

async function fetchBTMCAPI() {
  const url = 'http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v';
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldPriceBot/1.0)' },
    timeout: 15000
  });
  const data = res.data?.DataList?.Data;
  if (!Array.isArray(data)) return [];

  const rows = data.map((row, index) => {
    const i = index + 1;
    return {
      name: row[`@n_${i}`] || '',
      buy: parseFloat(row[`@pb_${i}`]) || 0,
      sell: parseFloat(row[`@ps_${i}`]) || 0
    };
  });

  return selectItems(rows, 10);
}

export async function fetchBTMC() {
  let items;
  try {
    items = await fetchBTMCWebsite();
  } catch (err) {
    console.warn('[BTMC] Website error:', err.message, '- dung API du phong');
    try {
      items = await fetchBTMCAPI();
    } catch (fallbackErr) {
      console.error('[BTMC] Fallback API error:', fallbackErr.message);
      return null;
    }
  }

  if (!items?.length) return null;
  return {
    source: 'BTMC',
    items,
    updatedAt: new Date().toISOString()
  };
}
