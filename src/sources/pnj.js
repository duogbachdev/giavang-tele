import axios from 'axios';

// PNJ - API tra gia theo nghin VND/chi, quy doi sang VND/luong.
export async function fetchPNJ() {
  try {
    const url = 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price';
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://giavang.pnj.com.vn/'
      },
      timeout: 15000
    });

    const list = res.data?.data;
    if (!Array.isArray(list) || list.length === 0) return null;

    // Lay cac loai chinh: SJC, Nhan PNJ, PNJ
    const wanted = ['SJC', 'N24K', 'PNJ', '24K'];
    const items = list
      .filter(x => wanted.includes(x.masp))
      .map(x => ({
        name: x.tensp,
        buy: parseFloat(x.giamua) * 10000,
        sell: parseFloat(x.giaban) * 10000
      }))
      .filter(x => x.buy > 0 && x.sell > 0);

    if (items.length === 0) return null;

    return {
      source: 'PNJ',
      items,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error('[PNJ] Fetch error:', err.message);
    return null;
  }
}
