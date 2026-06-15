import axios from 'axios';

// BTMC - Bao Tin Minh Chau, public API.
// Gia vang trong API la VND/chi, quy doi sang VND/luong.
export async function fetchBTMC() {
  try {
    const url = 'http://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const data = res.data?.DataList?.Data;
    if (!Array.isArray(data) || data.length === 0) return null;

    // Cac loai vang BTMC chinh muon hien thi (ten chinh xac trong API)
    const targetNames = [
      'NHẪN TRÒN TRƠN',
      'VÀNG MIẾNG VRTL',
      'VÀNG MIẾNG SJC',
      'TRANG SỨC VÀNG RỒNG THĂNG LONG 999.9'
    ];

    const items = [];
    const seen = new Set();

    data.forEach((row, idx) => {
      const i = idx + 1;
      const name = row[`@n_${i}`];
      if (!name) return;
      // Bo bac
      if (name.toUpperCase().includes('BẠC')) return;

      const matched = targetNames.find(t => name.includes(t));
      if (!matched || seen.has(matched)) return;

      const buy = parseFloat(row[`@pb_${i}`]) || 0;
      const sell = parseFloat(row[`@ps_${i}`]) || 0;
      if (buy <= 0 || sell <= 0) return;

      seen.add(matched);
      items.push({ name, buy: buy * 10, sell: sell * 10 });
    });

    if (items.length === 0) return null;

    return {
      source: 'BTMC',
      items,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[BTMC] Fetch error:', err.message);
    return null;
  }
}
