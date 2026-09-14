/**
 * عتبة — مستقبِل تسجيلات الاهتمام (lead-receiver)
 * خدمة صغيرة تعمل داخل المملكة (Oracle Cloud الرياض — الطبقة المجانية الدائمة) حتى لا تُحفظ بيانات شخصية على Vercel/Neon.
 * الاعتماد الوحيد: pg. المصادقة: HMAC-SHA256 على (ts.body) بسرّ مشترك، ونافذة ٥ دقائق.
 *
 * POST /interest                 → إدراج، يعيد {id, ref}
 * GET  /interest?status=new      → القائمة (بلا المحذوفين)
 * GET  /interest/:ref            → سجلّ واحد
 * POST /interest/:ref/event      → {kind: contacted|converted|withdrawn, actor, person_id?}
 * GET  /health                   → {ok:true}
 * مهمّة الحفظ: كل ٢٤ ساعة — حذف فعلي لمن لم يُحوَّل بعد ١٢ شهراً من آخر تواصل.
 */
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const PORT = +(process.env.PORT || 8787);
const SECRET = process.env.LEADS_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!SECRET || !DATABASE_URL) { console.error('LEADS_SECRET و DATABASE_URL مطلوبان'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, no) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 64_000) no(new Error('too_large')); }); req.on('end', () => ok(b)); req.on('error', no); });

function verify(req, body) {
  const ts = req.headers['x-atbah-ts'], sig = req.headers['x-atbah-sig'];
  if (typeof ts !== 'string' || typeof sig !== 'string') return false;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  const expect = createHmac('sha256', SECRET).update(ts + '.' + body).digest('hex');
  return expect.length === sig.length && timingSafeEqual(Buffer.from(expect), Buffer.from(sig));
}

const PHONE = /^05\d{8}$/;
const WISH = { pay: ['undecided','loan','cash'], purpose: ['live','invest','both'], ptype: ['any','apartment','floor','duplex','villa','townhouse','land'], rooms: ['any','1','2','3','4','5+'], status: ['any','ready','offplan'], when: ['3m','6m','12m','explore'] };
const wishes = (w) => { const o = w && typeof w === 'object' ? w : {}, out = {}; for (const k of Object.keys(WISH)) if (WISH[k].includes(o[k])) out[k] = o[k]; if (typeof o.district === 'string' && o.district.trim()) out.district = o.district.trim().slice(0, 120); return out; };
const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

async function createInterest(rec) {
  const name = clean(rec.name, 120), phone = clean(rec.phone, 20), email = clean(rec.email, 160) || null;
  const role = clean(rec.role, 40) || 'other', city = clean(rec.city, 60) || '—', note = clean(rec.note, 1000) || null;
  const budget = Number.isFinite(+rec.budget) && +rec.budget > 0 ? Math.round(+rec.budget) : null;
  if (name.length < 2 || !PHONE.test(phone)) throw Object.assign(new Error('invalid'), { code: 400 });
  if (rec.consent_text_ver !== 'phase0-v1' && !String(rec.consent_text_ver || '').match(/^[a-z0-9-]{3,30}$/)) throw Object.assign(new Error('consent'), { code: 400 });
  const r = await pool.query(
    `INSERT INTO interest_registrations
      (name, phone, email, role, city, budget, note, consent_text_ver, consent_lang, consent_at, marketing_consent, ip_hash, source, wishes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12,$13) RETURNING id, ref`,
    [name, phone, email, role, city, budget, note, rec.consent_text_ver, rec.consent_lang === 'en' ? 'en' : 'ar', !!rec.marketing_consent, clean(rec.ip_hash, 64) || null, clean(rec.source, 60) || 'site', JSON.stringify(wishes(rec.wishes))],
  );
  await pool.query(`INSERT INTO interest_events (interest_id, kind, actor) VALUES ($1,'created','site')`, [r.rows[0].id]);
  return r.rows[0];
}

async function addEvent(ref, ev) {
  const kind = ['contacted', 'converted', 'withdrawn'].includes(ev.kind) ? ev.kind : null;
  if (!kind) throw Object.assign(new Error('kind'), { code: 400 });
  const cur = await pool.query(`SELECT id FROM interest_registrations WHERE ref=$1 AND deleted_at IS NULL`, [ref]);
  if (!cur.rowCount) throw Object.assign(new Error('not_found'), { code: 404 });
  const id = cur.rows[0].id, actor = clean(ev.actor, 120) || 'ops';
  if (kind === 'contacted') await pool.query(`UPDATE interest_registrations SET status='contacted', contacted_at=COALESCE(contacted_at, now()) WHERE id=$1`, [id]);
  if (kind === 'converted') await pool.query(`UPDATE interest_registrations SET status='converted', person_id=$2 WHERE id=$1`, [id, clean(ev.person_id, 64) || null]);
  if (kind === 'withdrawn') // سحب الموافقة: مسح الحقول الشخصية فوراً، إبقاء المرجع والحدث للسجلّ
    await pool.query(`UPDATE interest_registrations SET name='—', phone='—', email=NULL, note=NULL, budget=NULL, status='closed', deleted_at=now() WHERE id=$1`, [id]);
  await pool.query(`INSERT INTO interest_events (interest_id, kind, actor) VALUES ($1,$2,$3)`, [id, kind, actor]);
  return { ok: true };
}

async function retention() {
  const r = await pool.query(`DELETE FROM interest_registrations WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
    OR (status IN ('new','contacted','closed') AND COALESCE(contacted_at, created_at) < now() - interval '12 months')`);
  if (r.rowCount) console.info(`[retention] deleted ${r.rowCount}`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
    const body = await readBody(req);
    if (!verify(req, body)) return json(res, 401, { error: 'unauthorized' });
    const m = url.pathname.match(/^\/interest(?:\/([A-Z0-9-]+))?(?:\/(event))?$/);
    if (!m) return json(res, 404, { error: 'not_found' });
    const [, ref, sub] = m;
    if (req.method === 'POST' && !ref) return json(res, 201, await createInterest(JSON.parse(body || '{}')));
    if (req.method === 'GET' && !ref) {
      const st = url.searchParams.get('status');
      const r = await pool.query(`SELECT * FROM interest_registrations WHERE deleted_at IS NULL ${st ? 'AND status=$1' : ''} ORDER BY created_at DESC LIMIT 500`, st ? [st] : []);
      return json(res, 200, r.rows);
    }
    if (req.method === 'GET' && ref && !sub) {
      const r = await pool.query(`SELECT * FROM interest_registrations WHERE ref=$1`, [ref]);
      return r.rowCount ? json(res, 200, r.rows[0]) : json(res, 404, { error: 'not_found' });
    }
    if (req.method === 'POST' && ref && sub === 'event') return json(res, 200, await addEvent(ref, JSON.parse(body || '{}')));
    return json(res, 405, { error: 'method' });
  } catch (e) {
    const code = e.code && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) console.error(e);
    return json(res, code, { error: e.message || 'error' });
  }
});

server.listen(PORT, () => console.info(`lead-receiver on :${PORT}`));
retention().catch(console.error);
setInterval(() => retention().catch(console.error), 24 * 60 * 60 * 1000);
