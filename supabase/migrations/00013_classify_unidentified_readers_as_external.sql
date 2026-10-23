UPDATE profiles AS profile
SET reader_type = CASE
    WHEN EXISTS (
        SELECT 1
        FROM registration_requests AS registration
        WHERE registration.user_id = profile.id
          AND registration.status::text = 'Approved'
    ) THEN 'External'::reader_type
    WHEN profile.teacher_id IS NOT NULL THEN 'Lecturer'::reader_type
    WHEN profile.student_id IS NOT NULL
      OR LOWER(profile.email) LIKE '%@fpt.edu.vn' THEN 'Student'::reader_type
    ELSE 'External'::reader_type
END
WHERE profile.role_id IN (SELECT id FROM roles WHERE name = 'Reader');
