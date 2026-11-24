const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const seedBikes = [
  { id: 'quad', name: '四人敞篷電動車', en: '4-seat Electric Carriage', ja: '4人乗り電動カート', tag: '親子首選', people: '載重 4 人', range: '續航 40km', price: 600, stock: 8, icon: '🚙' },
  { id: 'tandem', name: '雙人浪漫電動協力車', en: 'Electric Tandem Bike', ja: '2人乗り電動タンデム', tag: '情侶推薦', people: '載重 2 人', range: '續航 45km', price: 400, stock: 12, icon: '🚲' },
  { id: 'city', name: '舒適城市休閒單車', en: 'City Cruiser', ja: 'シティサイクル', tag: '輕便代步', people: '載重 1 人', range: '多段變速', price: 150, stock: 25, icon: '🚴' },
  { id: 'child', name: '親子兒童座椅單車', en: 'Family Bike with Child Seat', ja: 'チャイルドシート付き自転車', tag: '親子同行', people: '載重 1大1小', range: '安全帶前／後座', price: 200, stock: 10, icon: '🚴‍♀️' }
];
function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if (db && db.bikes && db.orders && db.groups) return db; } catch (_) {}
  const db = { bikes: seedBikes, orders: [], groups: [] }; saveStore(db); return db;
}
function saveStore(db) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
let db = loadStore();
const slots = ['09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00'];
const active = o => ['pending', 'paid', 'redeemed'].includes(o.status);
function available(bikeId, date, slot) {
  const bike = db.bikes.find(b => b.id === bikeId); if (!bike) return 0;
  const reserved = db.orders.filter(o => o.bikeId === bikeId && o.date === date && o.slot === slot && active(o)).reduce((n, o) => n + o.quantity, 0);
  return Math.max(0, bike.stock - reserved);
}
function cleanup() {
  let changed = false; const now = Date.now();
  for (const o of db.orders) if (o.status === 'pending' && o.expiresAt <= now) { o.status = 'expired'; changed = true; }
  if (changed) saveStore(db);
}
const dateOK = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00`).toString() !== 'Invalid Date' && s >= new Date().toISOString().slice(0, 10);
function safeOrder(o) { const { qrData, ...rest } = o; return rest; }

app.get('/api/bikes', (req, res) => { cleanup(); const date = req.query.date || new Date().toISOString().slice(0, 10); const slot = req.query.slot || slots[0]; res.json({ bikes: db.bikes, slots, date, availability: Object.fromEntries(db.bikes.map(b => [b.id, available(b.id, date, slot)])) }); });
app.get('/api/availability', (req, res) => { cleanup(); const { date, slot } = req.query; if (!dateOK(date) || !slots.includes(slot)) return res.status(400).json({ error: '請選擇有效日期與時段' }); res.json(Object.fromEntries(db.bikes.map(b => [b.id, available(b.id, date, slot)]))); });
app.post('/api/reservations', (req, res) => {
  cleanup(); const { bikeId, date, slot, quantity, name, phone, email, paymentPlan, paymentMethod } = req.body || {};
  const bike = db.bikes.find(b => b.id === bikeId); const qty = Number(quantity);
  if (!bike || !dateOK(date) || !slots.includes(slot) || !Number.isInteger(qty) || qty < 1 || qty > 10) return res.status(400).json({ error: '預約內容有誤，請重新選擇' });
  const hasCustomer = Boolean(name || phone || email);
  if (hasCustomer && (!name || !phone || !email || !/^\S+@\S+\.\S+$/.test(email))) return res.status(400).json({ error: '請填妥姓名、手機與有效 Email' });
  const left = available(bikeId, date, slot); if (qty > left) return res.status(409).json({ error: `庫存不足，目前剩餘 ${left} 輛`, availability: left });
  const now = Date.now(); const id = `BL-${date.replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; const total = bike.price * qty;
  const order = { id, bikeId, bikeName: bike.name, date, slot, quantity: qty, name: name ? String(name).trim() : '', phone: phone ? String(phone).trim() : '', email: email ? String(email).trim() : '', paymentPlan: paymentPlan || '', paymentMethod: paymentMethod || '', total, paid: 0, balance: total, status: 'pending', createdAt: now, expiresAt: now + 10 * 60 * 1000 };
  db.orders.push(order); saveStore(db); res.status(201).json({ order: safeOrder(order), expiresAt: order.expiresAt });
});
app.post('/api/orders/:id/pay', async (req, res) => {
  cleanup(); const o = db.orders.find(x => x.id === req.params.id); if (!o) return res.status(404).json({ error: '找不到訂單' });
  if (o.status !== 'pending' || o.expiresAt <= Date.now()) return res.status(409).json({ error: '訂單保留時間已結束，請重新預約' });
  const { name, phone, email, paymentPlan, paymentMethod } = req.body || {};
  if (!name || !phone || !email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: '請填妥姓名、手機與有效 Email' });
  if (!['full', 'deposit'].includes(paymentPlan) || !['Line Pay', '信用卡', 'Apple Pay', 'ATM'].includes(paymentMethod)) return res.status(400).json({ error: '請選擇付款方案與方式' });
  o.name = String(name).trim(); o.phone = String(phone).trim(); o.email = String(email).trim(); o.paymentPlan = paymentPlan; o.paymentMethod = paymentMethod;
  o.paid = paymentPlan === 'deposit' ? Math.ceil(o.total * .2) : o.total; o.balance = o.total - o.paid;
  o.status = 'paid'; o.paidAt = Date.now(); o.qrData = await QRCode.toDataURL(JSON.stringify({ id: o.id }), { width: 320, margin: 1, color: { dark: '#0c3450', light: '#ffffff' } }); saveStore(db); res.json({ order: safeOrder(o), qr: o.qrData, message: '已模擬發送簡訊與 Email 通知' });
});
app.get('/api/orders/:id', (req, res) => { cleanup(); const o = db.orders.find(x => x.id === req.params.id); if (!o) return res.status(404).json({ error: '找不到訂單' }); res.json({ order: safeOrder(o), qr: o.qrData || null }); });
app.get('/api/admin/overview', (req, res) => { cleanup(); const date = req.query.date || new Date().toISOString().slice(0, 10); const orders = db.orders.filter(o => o.date === date); res.json({ date, slots, bikes: db.bikes.map(b => ({ ...b, availability: Object.fromEntries(slots.map(s => [s, available(b.id, date, s)])) })), orders: orders.map(safeOrder), revenue: orders.filter(o => ['paid', 'redeemed'].includes(o.status)).reduce((n, o) => n + o.paid, 0) }); });
app.post('/api/admin/lookup', (req, res) => { cleanup(); const id = String(req.body?.id || '').trim(); const o = db.orders.find(x => x.id.toLowerCase() === id.toLowerCase()); if (!o) return res.status(404).json({ error: '查無此訂單，請確認訂單編號' }); res.json({ order: safeOrder(o) }); });
app.post('/api/admin/redeem', (req, res) => { const o = db.orders.find(x => x.id === String(req.body?.id || '').trim()); if (!o) return res.status(404).json({ error: '查無此訂單' }); if (o.status === 'redeemed') return res.status(409).json({ error: '此訂單已核銷' }); if (o.status !== 'paid') return res.status(409).json({ error: '訂單尚未付款或已逾期' }); o.status = 'redeemed'; o.redeemedAt = Date.now(); saveStore(db); res.json({ order: safeOrder(o), message: '核銷成功，祝旅途愉快！' }); });
app.post('/api/groups', (req, res) => { const { company, contact, phone, email, people, bikes, taxId, date } = req.body || {}; if (!company || !contact || !phone || !email || !Number.isInteger(Number(people)) || Number(people) < 20 || !bikes || !dateOK(date)) return res.status(400).json({ error: '請填妥資料，團體人數需為 20 人以上' }); const id = `BG-${Date.now().toString().slice(-8)}`; const group = { id, company, contact, phone, email, people: Number(people), bikes, taxId: taxId || '', date, account: `822-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, quote: Number(people) * 150, createdAt: Date.now() }; db.groups.push(group); saveStore(db); res.status(201).json(group); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Bali Bike Booking listening on ${PORT}`));
