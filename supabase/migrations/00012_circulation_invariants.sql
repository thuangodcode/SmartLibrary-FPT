-- Circulation invariants. Do not run against production until duplicate rows are reviewed.
-- barcode already has a UNIQUE column constraint in 00001_initial_schema.sql.

-- One occupying loan per copy. Pending requests do not occupy a copy.
CREATE UNIQUE INDEX IF NOT EXISTS ux_borrow_records_one_active_copy
ON borrow_records (book_copy_id)
WHERE is_deleted = FALSE
AND status IN ('borrowed', 'overdue', 'approved');

-- One compensation fine per loan. Overdue fines stay allowed on the same loan.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fines_one_compensation_per_loan
ON fines (borrow_record_id)
WHERE is_deleted = FALSE
AND (
reason LIKE 'Bồi thường mất sách%'
OR reason LIKE 'Bồi thường hư hỏng%'
);

-- One overdue fine per loan.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fines_one_overdue_per_loan
ON fines (borrow_record_id)
WHERE is_deleted = FALSE
AND reason LIKE 'Phạt quá hạn%';
