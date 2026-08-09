// 冠通工程行打卡系統 — Firestore 每日自動備份腳本
// 由 .github/workflows/backup.yml 排程執行，不需要手動跑

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('缺少環境變數 FIREBASE_SERVICE_ACCOUNT_JSON，請確認 GitHub Secret 是否設定正確');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch (e) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON 不是合法的 JSON，請確認貼上的內容完整', e);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const COLLECTIONS = ['employees', 'records', 'leaves', 'settings'];

function serializeValue(v) {
  if (v && typeof v === 'object' && typeof v.toDate === 'function') {
    return v.toDate().toISOString();
  }
  return v;
}

function serializeDoc(data) {
  const out = {};
  for (const key of Object.keys(data)) {
    if (key === 'photo') continue; // 刻意跳過照片欄位，減少備份檔案大小
    out[key] = serializeValue(data[key]);
  }
  return out;
}

async function main() {
  const backup = {
    exportedAt: new Date().toISOString(),
    note: '此備份不含打卡照片（photo 欄位），照片有獨立的自動清除機制',
    collections: {},
  };

  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    backup.collections[col] = snap.docs.map((d) => ({ id: d.id, ...serializeDoc(d.data()) }));
    console.log(`${col}: 匯出 ${snap.size} 筆`);
  }

  const outDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'latest-backup.json');
  fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`備份完成，已寫入 ${outPath}`);
}

main().catch((err) => {
  console.error('備份失敗：', err);
  process.exit(1);
});
