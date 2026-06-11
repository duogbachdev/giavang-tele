import axios from 'axios';
import * as cheerio from 'cheerio';

// DOJI - lay tu endpoint cong khai update.giavang.doji.vn (XML feed)
// Don vi: nghin VND/chi -> can nhan 1000 va voi luong (1 luong = 10 chi)
// Thuc te du lieu: 13100 = 13,100,000 VND/luong (don vi nghin/luong)
export async function fetchDOJI() {
  try {
    const url = 'http://update.giavang.doji.vn/banggia/doji_92411/2';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(res.data, { xmlMode: true });
    const items = [];

    $('Row').each((_, el) => {
      const name = $(el).attr('Name');
      const buy = $(el).attr('Buy');
      const sell = $(el).attr('Sell');
      if (!name || !buy || !sell) return;
      if (name.includes('SJC') || name.includes('Nhẫn') || name.includes('9999') || name.includes('Trang')) {
        const buyNum = parseFloat(String(buy).replace(/[,.]/g, ''));
        const sellNum = parseFloat(String(sell).replace(/[,.]/g, ''));
        if (buyNum <= 0 || sellNum <= 0) return;
        items.push({
          name: name.trim(),
          buy: buyNum * 1000,  // nghin -> VND
          sell: sellNum * 1000
        });
      }
    });

    if (items.length === 0) return null;

    return {
      source: 'DOJI',
      items: items.slice(0, 4),
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[DOJI] Fetch error:', err.message);
    return null;
  }
}
