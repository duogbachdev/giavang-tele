import axios from 'axios';
import * as cheerio from 'cheerio';

const wantedProducts = [
  { key: 'vrtl', matches: name => name.includes('VRTL') && name.includes('VANG MIENG') },
  { key: 'nhan', matches: name => name.includes('NHAN TRON') },
  { key: 'sjc', matches: name => name.includes('SJC') && name.includes('VANG MIENG') },
  { key: 'trang-suc', matches: name => name.includes('TRANG SUC') && name.includes('999.9') }
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
    const matched = wantedProducts.find(product => product.matches(normalizedName));
    if (!matched || seen.has(matched.key) || row.buy <= 0 || row.sell <= 0) continue;

    seen.add(matched.key);
    items.push({
      name: row.name,
      buy: row.buy * unitMultiplier,
      sell: row.sell * unitMultiplier
    });
  }

  return items;
}

async function fetchBTMCMirror() {
  const res = await axios.get('https://giavang.org/trong-nuoc/bao-tin-minh-chau/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldPriceBot/1.0)' },
    timeout: 10000
  });
  const $ = cheerio.load(res.data);
  const rows = [];
  let brand = '';

  $('table').first().find('tr').each((_, element) => {
    const rowBrand = $(element).find('th').first().text().trim();
    if (rowBrand) brand = rowBrand;
    const cells = $(element).find('td').map((__, cell) => $(cell).text().trim()).get();
    if (cells.length < 3) return;

    const buy = parseFloat(cells[cells.length - 2].replace(/[,.]/g, '')) || 0;
    const sell = parseFloat(cells[cells.length - 1].replace(/[,.]/g, '')) || 0;
    rows.push({ name: `${brand} ${cells[0]}`.trim(), buy, sell });
  });

  return selectItems(rows, 1000);
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
    items = await fetchBTMCMirror();
    if (!items.length) throw new Error('khong tim thay bang gia');
  } catch (err) {
    console.warn('[BTMC] Mirror error:', err.message, '- dung website chinh');
    try {
      items = await fetchBTMCWebsite();
      if (!items.length) throw new Error('khong tim thay bang gia');
    } catch (websiteErr) {
      console.warn('[BTMC] Website error:', websiteErr.message, '- dung API du phong');
      try {
        items = await fetchBTMCAPI();
      } catch (apiErr) {
        console.error('[BTMC] Fallback API error:', apiErr.message);
        return null;
      }
    }
  }

  if (!items?.length) return null;
  return {
    source: 'BTMC',
    items,
    updatedAt: new Date().toISOString()
  };
}
