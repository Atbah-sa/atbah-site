/**
 * عتبة — /api/leads-export (Vercel Serverless Function, Node 20)
 * تصدير للقراءة فقط لتسجيلات «اطلب عقارك» (وغيرها) إلى نظام عتبة التشغيلي.
 * لا يُخزّن شيء على Vercel: يوقّع طلب قراءة (HMAC) إلى المستقبِل داخل المملكة ويعيد الحقول اللازمة للنظام.
 * الحماية: رمز قراءة LEADS_READ_TOKEN (متغيّر بيئة على Vercel) يُمرَّر في ?token= — بدونه 401.
 *   GET /api/leads-export?token=…&source=request&hours=48
 */
import { createHmac } from 'node:crypto';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  const token = process.env.LEADS_READ_TOKEN;
  if (!token || String(req.query.token || '') !== token) return res.status(401).json({ error: 'unauthorized' });
  const endpoint = (process.env.LEADS_ENDPOINT || '').replace(/\/$/, ''), secret = process.env.LEADS_SECRET;
  if (!endpoint || !secret) return res.status(503).json({ error: 'not_configured' });
  const hours = Math.min(24 * 30, Math.max(1, +req.query.hours || 48));
  const srcFilter = String(req.query.source || '');
  try {
    const ts = String(Date.now()), body = '';
    const r = await fetch(`${endpoint}/interest`, { headers: { 'X-Atbah-Ts': ts, 'X-Atbah-Sig': createHmac('sha256', secret).update(ts + '.' + body).digest('hex') }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('receiver_' + r.status);
    const rows = await r.json();
    const since = Date.now() - hours * 3600_000;
    const out = rows.filter((x) => new Date(x.created_at).getTime() >= since && (!srcFilter || String(x.source || '').startsWith(srcFilter)))
      .map((x) => ({ ref: x.ref, created_at: x.created_at, status: x.status, name: x.name, phone: x.phone, city: x.city, budget: x.budget, note: x.note, source: x.source, wishes: typeof x.wishes === 'string' ? JSON.parse(x.wishes || '{}') : (x.wishes || {}) }));
    return res.status(200).json({ count: out.length, hours, rows: out });
  } catch (e) {
    console.error('[leads-export] failed', e.message);
    return res.status(502).json({ error: 'fetch_failed' });
  }
}
