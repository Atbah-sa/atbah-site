/**
 * عتبة — /api/interest (Vercel Serverless Function, Node 20)
 * يستقبل نموذج الاهتمام من الموقع الساكن، يتحقّق، ثم:
 *  - يرسله موقَّعاً (HMAC) إلى مستقبِل التسجيلات داخل المملكة (LEADS_ENDPOINT على Oracle الرياض) — لا يُحفظ شيء على Vercel.
 *  - يرسل إشعاراً بريدياً فورياً (Resend) بالاسم الأول والجوّال مقنّعاً.
 * إن لم يُضبط LEADS_ENDPOINT يعيد 503 not_configured والموقع يعرض رسالة بديلة (لا يُقبل أي تسجيل بلا مخزن داخل المملكة).
 */
import { createHash, createHmac } from 'node:crypto';

const PHONE = /^(05\d{8}|\+9665\d{8}|9665\d{8})$/;
const WISH = { pay: ['undecided', 'loan', 'cash'], purpose: ['live', 'invest', 'both'], ptype: ['any', 'apartment', 'floor', 'duplex', 'villa', 'townhouse', 'land'], rooms: ['any', '1', '2', '3', '4', '5+'], status: ['any', 'ready', 'offplan'], when: ['3m', '6m', '12m', 'explore'] };
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const hits = new Map(); // تحديد معدّل بسيط لكل IP: ٥ طلبات / ١٠ دقائق (لكل نسخة من الدالّة)

function rateLimited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  arr.push(now); hits.set(ip, arr); return arr.length > 5;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const b = typeof req.body === 'object' && req.body ? req.body : {};
  const name = clean(b.name, 120), rawPhone = clean(b.phone, 20).replace(/\s|-/g, ''), email = clean(b.email, 160) || null;
  if (name.length < 2 || !PHONE.test(rawPhone)) return res.status(400).json({ error: 'invalid' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (b.consent_text_ver !== 'phase0-v1') return res.status(400).json({ error: 'consent' });
  const phone = rawPhone.replace(/^(\+?966)/, '0');
  const wishes = {}; const w = b.wishes && typeof b.wishes === 'object' ? b.wishes : {};
  for (const k of Object.keys(WISH)) if (WISH[k].includes(w[k])) wishes[k] = w[k];
  if (clean(w.district, 120)) wishes.district = clean(w.district, 120);

  const rec = {
    name, phone, email, role: clean(b.role, 40) || 'other', city: clean(b.city, 60) || '—',
    budget: Number.isFinite(+b.budget) && +b.budget > 0 ? Math.round(+b.budget) : null, note: clean(b.note, 1000) || null,
    consent_text_ver: 'phase0-v1', consent_lang: b.consent_lang === 'en' ? 'en' : 'ar', marketing_consent: !!b.marketing_consent,
    ip_hash: createHash('sha256').update((process.env.IP_SALT || 'atbah') + ip).digest('hex').slice(0, 32),
    source: clean(b.source, 60) || 'site', wishes,
  };

  const endpoint = (process.env.LEADS_ENDPOINT || '').replace(/\/$/, ''), secret = process.env.LEADS_SECRET;
  if (!endpoint || !secret) return res.status(503).json({ error: 'not_configured' });

  let saved;
  try {
    const body = JSON.stringify(rec), ts = String(Date.now());
    const r = await fetch(`${endpoint}/interest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Atbah-Ts': ts, 'X-Atbah-Sig': createHmac('sha256', secret).update(ts + '.' + body).digest('hex') },
      body, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error('receiver_' + r.status);
    saved = await r.json();
  } catch (e) {
    console.error('[interest] receiver failed', e.message);
    return res.status(502).json({ error: 'save_failed' });
  }

  // إشعار بريدي (لا يُوقف الردّ إن فشل)
  const to = (process.env.NOTIFY_EMAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.RESEND_API_KEY && to.length) {
    const first = name.split(/\s+/)[0], masked = phone.replace(/^(\d{4})\d+(\d{2})$/, '$1••••$2');
    const subject = `عتبة — اهتمام جديد ${saved.ref} · ${first} · ${rec.city}`;
    const rows = [['المرجع', saved.ref], ['الاسم', first], ['الجوّال', masked], ['الدور', rec.role], ['المدينة', rec.city], ['السقف التقديري', rec.budget ? rec.budget.toLocaleString('en-US') + ' ريال' : '—'], ['الرغبة', Object.entries(wishes).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'], ['المصدر', rec.source]];
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.8;color:#10322D"><p><b>اهتمام جديد وصل الآن.</b> اتّصال واحد خلال يومي عمل — لا كتالوج.</p><table>${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5C7570">${k}</td><td><b>${v}</b></td></tr>`).join('')}</table><p style="font-size:12px;color:#8A9B96">التفاصيل الكاملة في المستقبِل داخل المملكة. لا تُعِد توجيه هذه الرسالة.</p></div>`;
    fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'عتبة <no-reply@atbah.sa>', to, subject, html }),
    }).catch((e) => console.error('[interest] email failed', e.message));
  }

  return res.status(201).json({ ref: saved.ref });
}
