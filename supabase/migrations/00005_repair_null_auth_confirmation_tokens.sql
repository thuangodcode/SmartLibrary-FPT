-- Supabase Auth expects confirmation_token to be a non-null string when it
-- loads a user. Replace corrupted NULL values with the empty "no token" value.
UPDATE auth.users
SET confirmation_token = ''
WHERE confirmation_token IS NULL;
