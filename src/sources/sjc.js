import axios from 'axios';

let fallbackApiKey = null;

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
    if (!price) return null;

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

// SJC chinh thuc thuong chan request tu server, nen co API du phong.
export async function fetchSJC() {
  try {
    const url = 'https://sjc.com.vn/GoldPrice/Services/PriceService.ashx';
    const res = await axios.post(url, 'method=GetSJCGoldPriceByDate&toDate=', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Origin': 'https://sjc.com.vn',
        'Referer': 'https://sjc.com.vn/'
      },
      timeout: 15000
    });

    const list = res.data?.data;
    if (!Array.isArray(list) || list.length === 0) return null;

    const sjc = list.find(d => d.TypeName?.includes('SJC')) || list[0];
    if (!sjc) return null;

    return {
      source: 'SJC',
      items: [{
        name: `Vang mieng SJC (${sjc.BranchName || 'HCM'})`,
        buy: parseFloat(sjc.Buy) * 1000,
        sell: parseFloat(sjc.Sell) * 1000
      }],
      updatedAt: sjc.UpdateTime || new Date().toISOString()
    };
  } catch (err) {
    console.warn('[SJC] Official API error:', err.message, '- dung API du phong');
    try {
      return await fetchSJCFallback();
    } catch (fallbackErr) {
      console.error('[SJC] Fallback API error:', fallbackErr.message);
      return null;
    }
  }
}
