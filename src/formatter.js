// Format gia tien VND, hien thi don vi nghin/luong
export function formatVND(amount) {
  if (!amount || isNaN(amount)) return 'N/A';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}

// Format snapshot thanh message Telegram (Markdown)
export function formatMessage(snapshots, opts = {}) {
  const { isPeriodic = false, changes = null } = opts;
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  let msg = isPeriodic
    ? `*BAO CAO GIA VANG DINH KY*\n_${now}_\n\n`
    : `*GIA VANG THAY DOI*\n_${now}_\n\n`;

  for (const snap of snapshots) {
    if (!snap) continue;
    msg += `*${snap.source}*\n`;
    for (const item of snap.items) {
      const change = changes?.[`${snap.source}::${item.name}`];
      let changeStr = '';
      if (change) {
        const diff = change.sellDiff;
        if (diff > 0) changeStr = ` (+${formatVND(diff)})`;
        else if (diff < 0) changeStr = ` (${formatVND(diff)})`;
      }
      msg += `- ${item.name}\n`;
      msg += `  Mua: ${formatVND(item.buy)} | Ban: ${formatVND(item.sell)}${changeStr}\n`;
    }
    msg += `\n`;
  }

  msg += `_Don vi: VND/luong_`;
  return msg;
}

// So sanh 2 lan quet, tra ve object cac thay doi
export function diffSnapshots(prev, curr) {
  if (!prev || !curr) return null;
  const changes = {};
  let hasChange = false;

  for (const snap of curr) {
    if (!snap) continue;
    const prevSnap = prev.find(p => p?.source === snap.source);
    if (!prevSnap) continue;

    for (const item of snap.items) {
      const prevItem = prevSnap.items.find(p => p.name === item.name);
      if (!prevItem) continue;

      const buyDiff = item.buy - prevItem.buy;
      const sellDiff = item.sell - prevItem.sell;
      if (buyDiff !== 0 || sellDiff !== 0) {
        changes[`${snap.source}::${item.name}`] = { buyDiff, sellDiff };
        hasChange = true;
      }
    }
  }

  return hasChange ? changes : null;
}
