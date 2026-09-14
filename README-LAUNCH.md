# عتبة — الإطلاق الحيّ (الموقع الساكن + دالّة واحدة) · 2026-09-14

هذا المجلّد **يُنشر كما هو** على Vercel: `index.html` (الموقع كاملاً: الهيرو، الحاسبات الـ١٧، التقرير، تسجيل الاهتمام، الخصوصية) + `api/interest.js` (تستقبل التسجيل وترسله إلى مستقبِل داخل المملكة + بريد). لا قاعدة بيانات على Vercel ولا بيانات شخصية.

## المرحلة ١ — الموقع حيّ (اليوم، ≈ ٣٠ دقيقة)
1. **GitHub**: أنشئ مستودعاً خاصاً باسم `atbah-site` → «Add file → Upload files» → اسحب محتويات هذا المجلّد كلّها (بما فيها مجلّد `api`) → Commit.
2. **Vercel**: سجّل الدخول بـ GitHub → Add New → Project → اختر `atbah-site` → Framework: **Other** → Deploy. خلال دقيقة يظهر رابط `atbah-site-xxx.vercel.app` — الحاسبات والتقرير تعمل فوراً؛ نموذج الاهتمام يعرض «التسجيل يُفتح خلال أيام» حتى المرحلة ٢.
3. **النطاق**: Vercel → Project → Settings → Domains → `atbah.sa` و`www.atbah.sa` → أضف السجلّات التي يعرضها Vercel عند مسجّل النطاق (عادةً `A 76.76.21.21` للجذر و`CNAME cname.vercel-dns.com` للـ www). الشهادة تلقائية.
4. أرسل لي رابط Vercel — أتحقّق من الصفحة والجوّال وOG وrobots قبل أي منشور.

## المرحلة ٢ — التسجيل يعمل (اليوم أو غداً، ≈ ٦٠ دقيقة)
5. **Oracle Cloud** (المنطقة الأمّ الرياض) → VM مجانية `VM.Standard.A1.Flex` Ubuntu 24.04 → افتح 80/443 → على الخادم انسخ مجلّد `lead-receiver/` من حزمة Atbah-Site-ComingSoon، `cp .env.example .env` (سرّان بـ`openssl rand -hex 32`)، ثم `docker compose up -d`. DNS: `A leads.atbah.sa → IP`. تحقّق: `https://leads.atbah.sa/health`.
6. **Resend**: حساب → نطاق atbah.sa (SPF/DKIM) → API key.
7. **Vercel → Settings → Environment Variables** (Production): `LEADS_ENDPOINT=https://leads.atbah.sa` · `LEADS_SECRET=<نفس السرّ>` · `RESEND_API_KEY` · `EMAIL_FROM=عتبة <no-reply@atbah.sa>` · `NOTIFY_EMAIL_TO=<بريدك>` · `IP_SALT=<عشوائي>` → Redeploy. أرسل تسجيلاً تجريبياً واحداً واسحب موافقته (`POST /interest/<ref>/event {kind:'withdrawn'}` أو من الوارد لاحقاً).

## قبل أول تسجيل حقيقي
- مراجعة المحامي لنصّ الموافقة وسياسة الخصوصية (النصّ في `index.html` → `INTEREST.consent` و`pagePrivacy`).
- `NOTIFY_EMAIL_TO` على بريد تقرؤه يومياً — العميل يُوعد باتصال واحد خلال يومي عمل.

## التحديثات لاحقاً
أرسل لي التعديل → أعطيك `index.html` جديداً → استبدله في GitHub (Upload files → replace) → Vercel ينشر تلقائياً خلال دقيقة. حزمة Next.js (المنصّة + الوارد) تحلّ محلّ هذا الموقع في الأسبوع ١–٢ على الرابط نفسه بلا تغيير في الروابط.
