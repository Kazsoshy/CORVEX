-- Allow customer registration names and the Pending Identity Review status
-- to fit the values already used by the Sales Agent cash-registration workflow.

ALTER TABLE customers ALTER COLUMN status TYPE VARCHAR(30);
ALTER TABLE customers ALTER COLUMN first_name TYPE VARCHAR(100);
ALTER TABLE customers ALTER COLUMN middle_name TYPE VARCHAR(50);
ALTER TABLE customers ALTER COLUMN last_name TYPE VARCHAR(100);
