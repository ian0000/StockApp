-- Better Auth stores supported ASCII email addresses in lowercase. Enforce the
-- same identity rule for writes outside the adapter, independently of DB locale.
CREATE UNIQUE INDEX "user_email_normalized_unique" ON "user" (lower("email" COLLATE "C"));
