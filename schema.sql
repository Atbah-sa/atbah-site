-- عتبة — مخطّط المستقبِل (مطابق لـ db/migrations/0002_interest_registrations.sql في المرحلة صفر)
CREATE TABLE IF NOT EXISTS interest_seq (year int PRIMARY KEY, n int NOT NULL DEFAULT 0);

CREATE OR REPLACE FUNCTION next_interest_ref() RETURNS text LANGUAGE plpgsql AS $$
DECLARE y int := EXTRACT(YEAR FROM now())::int; k int;
BEGIN
  INSERT INTO interest_seq(year, n) VALUES (y, 1) ON CONFLICT (year) DO UPDATE SET n = interest_seq.n + 1 RETURNING n INTO k;
  RETURN 'ATB-I-' || y || '-' || lpad(k::text, 4, '0');
END $$;

CREATE TABLE IF NOT EXISTS interest_registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref               text UNIQUE NOT NULL DEFAULT next_interest_ref(),
  name              text NOT NULL,
  phone             text NOT NULL,
  email             text,
  role              text NOT NULL,
  city              text NOT NULL,
  budget            numeric,
  note              text,
  status            text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','closed')),
  consent_text_ver  text NOT NULL,
  consent_lang      text NOT NULL DEFAULT 'ar',
  consent_at        timestamptz NOT NULL DEFAULT now(),
  marketing_consent boolean NOT NULL DEFAULT false,
  ip_hash           text,
  source            text,
  person_id         text,
  wishes            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- الرغبة: pay · purpose · ptype · rooms · status · when · district
  created_at        timestamptz NOT NULL DEFAULT now(),
  contacted_at      timestamptz,
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS interest_status_idx ON interest_registrations (status, created_at DESC);

CREATE TABLE IF NOT EXISTS interest_events (
  id          bigserial PRIMARY KEY,
  interest_id uuid NOT NULL REFERENCES interest_registrations(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  actor       text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);

-- ترقية قاعدة موجودة:
ALTER TABLE interest_registrations ADD COLUMN IF NOT EXISTS wishes jsonb NOT NULL DEFAULT '{}'::jsonb;
