/**
 * عتبة — /api/google-lead (Vercel Serverless Function, Node 20)
 * يستقبل طلبات «نموذج العميل المحتمل» من إعلانات Google (Lead form asset → Webhook)
 * ويمرّرها إلى نفس مسار /api/interest: الحفظ في مستقبِل التسجيلات داخل المملكة + إشعار بريدي.
 * التحقق: google_key في جسم الطلب يجب أن يطابق GOOGLE_LEAD_KEY.
 * طلبات الاختبار من Google (is_test=true) يُردّ عليها 200 بلا حفظ.
 */
import interest from './interest.js';

const col = (rows, id) => {
  const r = (rows || []).find((x) => x && (x.column_id === id || x.column_name === id));
  return r && typeof r.string_value === 'string' ? r.string_value.trim() : '';
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const b = typeof req.body === 'object' && req.body ? req.body : {};
  const key = process.env.GOOGLE_LEAD_KEY;
  if (!key || b.google_key !== key) return res.status(403).json({ error: 'key' });
  if (b.is_test) return res.status(200).json({ ok: true, test: true });

  const rows = b.user_column_data;
  const name = col(rows, 'FULL_NAME') || [col(rows, 'FIRST_NAME'), col(rows, 'LAST_NAME')].filter(Boolean).join(' ');
  const phone = col(rows, 'PHONE_NUMBER').replace(/[^\d+]/g, '');
  const city = col(rows, 'CITY');
  const project = typeof b.campaign_name === 'string' ? b.campaign_name : '';

  // نمرّر الطلب إلى معالج /api/interest نفسه (نفس التحقق والحفظ والإشعار)
  const fwd = {
    method: 'POST',
    headers: { 'x-forwarded-for': 'google-lead-' + String(b.lead_id || Date.now()) },
    body: {
      name, phone, city: city || 'الرياض', role: 'buyer',
      note: `نموذج إعلان Google${project ? ' — ' + project : ''}${b.campaign_id ? ' (حملة ' + b.campaign_id + ')' : ''}`,
      consent_text_ver: 'phase0-v3', consent_lang: 'ar', marketing_consent: false,
      source: ('google-leadform-' + String(b.campaign_id || 'x')).slice(0, 60),
    },
  };
  let status = 500, out = {};
  const fakeRes = {
    setHeader() {},
    status(s) { status = s; return { json(o) { out = o; return fakeRes; } }; },
  };
  await interest(fwd, fakeRes);
  // Google يعيد المحاولة عند غير 200؛ نرد 200 عند النجاح أو عند بيانات غير صالحة (لا فائدة من الإعادة)
  if (status === 201 || status === 400) return res.status(200).json({ ok: status === 201, ...out });
  return res.status(502).json({ error: 'save_failed' });
}
