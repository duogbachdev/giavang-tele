import axios from 'axios';

// SJC - thu nhieu endpoint, neu fail thi tra null
// Hien tai sjc.com.vn return 403 voi nhieu User-Agent.
// Backup: lay gia SJC tu PNJ/DOJI (cac nguon nay deu co Vang mieng SJC).
export async function fetchSJC() {
  try {
    const url = 'https://sjc.com.vn/GoldPrice/Services/PriceService.ashx';
    const res = await axios.post(url, 'method=GetSJCGoldPriceByDate&toDate=', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0',
        'Accept': '*/*',
        'Origin': 'https://sjc.com.vn',
        'Referer': 'https://sjc.com.vn/'
      },
      timeout: 15000
    });

    const list = res.data?.data;
    if (!Array.isArray(list) || list.length === 0) return null;

    const sjc = list.find(d => d.TypeName?.includes('SJC') && d.BranchName?.includes('Hồ Chí Minh'))
              || list.find(d => d.TypeName?.includes('SJC'))
              || list[0];
    if (!sjc) return null;

    return {
      source: 'SJC',
      items: [{
        name: `Vàng miếng SJC (${sjc.BranchName || 'HCM'})`,
        buy: parseFloat(sjc.Buy) * 1000,
        sell: parseFloat(sjc.Sell) * 1000
      }],
      updatedAt: sjc.UpdateTime || new Date().toISOString()
    };
  } catch (err) {
    // SJC chinh thuc thuong chan bot. Bo qua lay tu PNJ/DOJI/BTMC.
    console.error('[SJC] Fetch error:', err.message, '(da co gia SJC tu nguon khac)');
    return null;
  }
}
