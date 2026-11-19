/**
 * عتبة — /api/whatsapp (Vercel Serverless Function, Node 20)
 * Webhook لـ WhatsApp Cloud API (Meta): كل من يراسل رقم واتساب عتبة يُسجَّل عميلاً محتملاً في Lead Desk مع رسالته.
 *  - GET: تحقّق Meta من الرابط (hub.verify_token يجب أن يطابق WHATSAPP_VERIFY_TOKEN).
 *  - POST: التحقق من التوقيع (X-Hub-Signature-256 بـ WHATSAPP_APP_SECRET) ثم تمرير الرسالة إلى /api/interest
 *    (نفس الحفظ في مستقبِل التسجيلات داخل المملكة + الإشعار البريدي) بالمصدر «whatsapp» والرسالة في الملاحظة.
 *  - منع التكرار: إن كان للرقم نفسه تسجيل واتساب خلال آخر WHATSAPP_DEDUPE_DAYS يوماً (افتراضي ٧) لا يُنشأ تسجيل جديد.
 *  - ردّ ترحيبي اختياري لأول رسالة فقط إن ضُبط WHATSAPP_ACCESS_TOKEN.
 * متغيّرات البيئة: WHATSAPP_VERIFY_TOKEN · WHATSAPP_APP_SECRET (إلزامي لاستقبال الرسائل) · WHATSAPP_ACCESS_TOKEN (اختياري) · WHATSAPP_DEDUPE_DAYS (اختياري)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import interest from './interest.js';

export const config = { api: { bodyParser: false } }; // نحتاج الجسم الخام للتحقق من توقيع Meta

const GRAPH = 'https://graph.facebook.com/v21.0';
const ARABIC = /[؀-ۿ]/;
const seen = new Set(); // معرّفات رسائل عولجت في هذه النسخة (Meta قد يعيد الإرسال)

const TYPE_LABEL = { image: 'صورة', video: 'فيديو', audio: 'رسالة صوتية', voice: 'رسالة صوتية', document: 'مستند', sticker: 'ملصق', location: 'موقع', contacts: 'جهة اتصال', reaction: 'تفاعل' };

function messageText(m) {
  const t = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title
    || m.image?.caption || m.video?.caption || m.document?.caption || '';
  if (t) return t.trim();
  if (m.type === 'location' && m.location) return `[موقع] ${m.location.name || ''} ${m.location.latitude},${m.location.longitude}`.trim();
  return `[${TYPE_LABEL[m.type] || m.type || 'رسالة'}]`;
}

const readRaw = (req) => new Promise((resolve, reject) => {
  if (typeof req.body === 'string') return resolve(req.body);
  if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
});

function validSignature(raw, header, secret) {
  if (!header || !header.startsWith('sha256=')) return false;
  const a = Buffer.from(header), b = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  return a.length === b.length && timingSafeEqual(a, b);
}

const local = (p) => String(p || '').replace(/\D/g, '').replace(/^966/, '0');

// هل للرقم تسجيل واتساب حديث؟ (قراءة موقّعة من المستقبِل — مثل /api/leads-export)
async function recentWhatsappLead(phone) {
  const endpoint = (process.env.LEADS_ENDPOINT || '').replace(/\/$/, ''), secret = process.env.LEADS_SECRET;
  if (!endpoint || !secret) return false;
  const days = Math.max(0, +process.env.WHATSAPP_DEDUPE_DAYS || 7);
  if (!days) return false;
  try {
    const ts = String(Date.now());
    const r = await fetch(`${endpoint}/interest`, { headers: { 'X-Atbah-Ts': ts, 'X-Atbah-Sig': createHmac('sha256', secret).update(ts + '.').digest('hex') }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    const since = Date.now() - days * 86400_000, want = local(phone);
    return (await r.json()).some((x) => String(x.source || '').startsWith('whatsapp') && local(x.phone) === want && new Date(x.created_at).getTime() >= since);
  } catch { return false; } // عند الشك نسجّل (تكرار أفضل من فقدان عميل)
}

async function saveLead({ name, phone, text, msgId }) {
  const fwd = {
    method: 'POST',
    headers: { 'x-forwarded-for': 'whatsapp-' + msgId },
    body: {
      name, phone, city: '—', role: 'buyer',
      note: `واتساب: ${text}`.slice(0, 1000),
      consent_text_ver: 'phase0-v3', consent_lang: ARABIC.test(text) || !text ? 'ar' : 'en', marketing_consent: false,
      source: 'whatsapp',
    },
  };
  let status = 500, out = {};
  const fakeRes = { setHeader() {}, status(s) { status = s; return { json(o) { out = o; return fakeRes; } }; } };
  await interest(fwd, fakeRes);
  return { status, ...out };
}

async function sendAck(phoneNumberId, to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneNumberId) return;
  const body = ARABIC.test(text) || !/[a-z]/i.test(text)
    ? 'أهلاً بك في عتبة 👋 وصلت رسالتك، وسيتواصل معك أحد مستشارينا قريباً.'
    : 'Welcome to Atbah 👋 We got your message — one of our advisors will contact you shortly.';
  try {
    const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error('[whatsapp] ack failed', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error('[whatsapp] ack failed', e.message); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const vt = process.env.WHATSAPP_VERIFY_TOKEN;
    if (q.get('hub.mode') === 'subscribe' && vt && q.get('hub.verify_token') === vt) return res.status(200).send(q.get('hub.challenge') || '');
    return res.status(403).send('Forbidden');
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return res.status(503).json({ error: 'not_configured' });
  const raw = await readRaw(req);
  if (!validSignature(raw, req.headers['x-hub-signature-256'], secret)) return res.status(401).json({ error: 'signature' });

  let body; try { body = JSON.parse(raw); } catch { return res.status(400).json({ error: 'json' }); }

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of v.messages || []) {
        if (!m.from || !m.id || seen.has(m.id) || m.type === 'reaction') continue;
        seen.add(m.id); if (seen.size > 2000) seen.clear();
        const text = messageText(m);
        const phone = String(m.from).replace(/\D/g, '');
        if (!/^9665\d{8}$/.test(phone)) { console.warn('[whatsapp] non-Saudi number, not saved:', phone.slice(0, 5) + '…', text.slice(0, 80)); continue; }
        if (await recentWhatsappLead(phone)) continue; // متابعة من عميل مسجَّل — تُرى في واتساب نفسه
        const name = (names[m.from] || '').trim().slice(0, 120);
        const r = await saveLead({ name: name.length >= 2 ? name : 'عميل واتساب', phone, text, msgId: m.id });
        if (r.status !== 201) { console.error('[whatsapp] save failed', r.status, r.error); seen.delete(m.id); return res.status(502).json({ error: 'save_failed' }); } // 502 → Meta يعيد المحاولة
        await sendAck(v.metadata?.phone_number_id, m.from, text);
      }
    }
  }
  return res.status(200).json({ ok: true }); // دائماً 200 للحالات الأخرى (statuses وغيرها) كي لا يعيد Meta الإرسال
}
