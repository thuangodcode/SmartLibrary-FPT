-- Public, unique policy code for readable URLs (PK remains UUID).
ALTER TABLE public.policy_rules ADD COLUMN IF NOT EXISTS code text;

UPDATE public.policy_rules SET code = 'CS01' WHERE id = 'a1000000-0000-0000-0000-000000000001' AND (code IS NULL OR code = '');
UPDATE public.policy_rules SET code = 'CS02' WHERE id = 'a1000000-0000-0000-0000-000000000002' AND (code IS NULL OR code = '');
UPDATE public.policy_rules SET code = 'CS03' WHERE id = 'a1000000-0000-0000-0000-000000000003' AND (code IS NULL OR code = '');
UPDATE public.policy_rules SET code = 'CS04' WHERE id = 'a1000000-0000-0000-0000-000000000004' AND (code IS NULL OR code = '');
UPDATE public.policy_rules SET code = 'CS05' WHERE id = 'a1000000-0000-0000-0000-000000000005' AND (code IS NULL OR code = '');
UPDATE public.policy_rules SET code = 'CS06' WHERE id = 'a1000000-0000-0000-0000-000000000006' AND (code IS NULL OR code = '');

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.policy_rules
  WHERE code IS NULL OR btrim(code) = ''
)
UPDATE public.policy_rules p
SET code = 'CS' || lpad((numbered.rn + 6)::text, 2, '0')
FROM numbered
WHERE p.id = numbered.id;

ALTER TABLE public.policy_rules ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_policy_rules_code_lower ON public.policy_rules (lower(code));
