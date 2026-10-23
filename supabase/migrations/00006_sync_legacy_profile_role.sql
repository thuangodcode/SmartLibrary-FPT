-- The application authorizes users through profiles.role_id, while legacy
-- Supabase RLS policies still inspect profiles.role. Keep both columns aligned.
-- role_id is authoritative when present; preserve the legacy role only when
-- role_id has not yet been assigned.
UPDATE public.profiles AS profile
SET role_id = role_record.id
FROM public.roles AS role_record
WHERE profile.role_id IS NULL
  AND lower(role_record.name) = profile.role::text;

UPDATE public.profiles AS profile
SET role = lower(role_record.name)::public.user_role
FROM public.roles AS role_record
WHERE profile.role_id = role_record.id
  AND lower(role_record.name) IN ('reader', 'librarian', 'admin')
  AND profile.role::text <> lower(role_record.name);

CREATE OR REPLACE FUNCTION public.sync_profile_legacy_role()
RETURNS TRIGGER AS $$
DECLARE
    role_name TEXT;
BEGIN
    IF NEW.role_id IS NULL THEN
        SELECT id INTO NEW.role_id
        FROM public.roles
        WHERE lower(name) = NEW.role::text
        LIMIT 1;

        IF NEW.role_id IS NULL THEN
            RAISE EXCEPTION 'No RBAC role matches profile legacy role %', NEW.role;
        END IF;
    END IF;

    SELECT name INTO role_name
    FROM public.roles
    WHERE id = NEW.role_id;

    IF role_name IS NULL OR lower(role_name) NOT IN ('reader', 'librarian', 'admin') THEN
        RAISE EXCEPTION 'Profile role_id % does not map to a supported application role', NEW.role_id;
    END IF;

    NEW.role := lower(role_name)::public.user_role;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_profile_legacy_role ON public.profiles;
CREATE TRIGGER sync_profile_legacy_role
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_legacy_role();
