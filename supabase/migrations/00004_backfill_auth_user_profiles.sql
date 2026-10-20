-- Ensure Auth users created before the profile trigger was installed have
-- an application profile. Keep them pending so this does not bypass approval.
INSERT INTO public.profiles (
    id,
    email,
    full_name,
    student_id,
    role,
    role_id,
    status,
    created_at,
    updated_at
)
SELECT
    auth_user.id,
    auth_user.email,
    COALESCE(
        NULLIF(auth_user.raw_user_meta_data->>'full_name', ''),
        SPLIT_PART(auth_user.email, '@', 1)
    ),
    auth_user.raw_user_meta_data->>'student_id',
    'reader'::user_role,
    reader_role.id,
    'PendingVerification'::account_status,
    NOW(),
    NOW()
FROM auth.users AS auth_user
CROSS JOIN public.roles AS reader_role
WHERE reader_role.name = 'Reader'
  AND auth_user.email IS NOT NULL
  AND auth_user.email <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth_user.id
  );
