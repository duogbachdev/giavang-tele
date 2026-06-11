# giavang-tele

Tool Node.js quet gia vang Vietnam realtime tu nhieu nguon (SJC, DOJI, PNJ, BTMC) va gui thong bao len Telegram.

## Tinh nang

- Quet dinh ky theo interval cau hinh
- Phat hien thay doi gia, chi gui khi co bien dong
- Bao cao dinh ky moi N lan quet (tuy chon)
- HTTP health endpoint cho Render free tier (chong sleep)
- 4 nguon: SJC, DOJI, PNJ, BTMC

## Cai dat local

```bash
npm install
cp .env.example .env
# Sua .env voi token + chat ID
npm start
```

## Cach lay Telegram Bot Token va Chat ID

### 1. Tao bot voi BotFather

1. Mo Telegram, search `@BotFather`
2. Gui lenh `/newbot`
3. Dat ten bot (vi du: `My Gold Price Bot`)
4. Dat username bot (phai ket thuc bang `bot`, vi du: `my_gold_price_bot`)
5. BotFather se tra ve token dang `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`
6. Copy token nay vao `TELEGRAM_BOT_TOKEN`

### 2. Lay Chat ID

Cach 1 - Chat rieng voi bot:
1. Mo bot vua tao, gui bat ky tin nhan nao (vi du `/start`)
2. Truy cap `https://api.telegram.org/bot<TOKEN>/getUpdates` (thay `<TOKEN>` bang token cua ban)
3. Tim `"chat":{"id": 123456789` - so do la Chat ID

Cach 2 - Group:
1. Them bot vao group
2. Gui tin nhan trong group co tag bot
3. Truy cap URL nhu tren, Chat ID group thuong la so am (vi du `-100123456789`)

## Deploy len Render (free)

1. Push code len GitHub
2. Vao https://render.com -> New -> Web Service
3. Connect repo
4. Cau hinh:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Them Environment Variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `SCAN_INTERVAL_MS` (mac dinh 300000 = 5 phut)
   - `NOTIFY_ON_CHANGE_ONLY=true`
   - `PERIODIC_REPORT_EVERY=12`
   - `SOURCES=sjc,doji,pnj,btmc`
6. Deploy

### Luu y Render Free

Render free se sleep sau 15 phut khong co request. Co 2 cach giu thuc:

- Dung cron-job.org (free): tao job ping `https://your-app.onrender.com/health` moi 10 phut
- Hoac UptimeRobot: tao monitor HTTP voi cung URL

## Cau hinh

| Bien | Mac dinh | Mo ta |
|------|----------|-------|
| `TELEGRAM_BOT_TOKEN` | - | Bat buoc |
| `TELEGRAM_CHAT_ID` | - | Bat buoc |
| `SCAN_INTERVAL_MS` | 300000 | Khoang quet (ms) |
| `NOTIFY_ON_CHANGE_ONLY` | true | Chi gui khi gia thay doi |
| `PERIODIC_REPORT_EVERY` | 12 | Bao cao dinh ky moi N lan quet (12 = moi 1h neu interval 5p) |
| `SOURCES` | sjc,doji,pnj,btmc | Cac nguon can quet |
| `PORT` | 3000 | Port HTTP server |

## Cau truc

```
src/
  index.js          # Entry point + scheduler + HTTP health
  telegram.js       # Telegram bot client
  formatter.js      # Format message + diff
  sources/
    sjc.js
    doji.js
    pnj.js
    btmc.js
```

## License

MIT
