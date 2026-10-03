CREATE TABLE "security_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"count" integer NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "security_rate_limits_scope_key_hash_pk" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "security_rate_limits_count_check" CHECK ("security_rate_limits"."count" > 0),
	CONSTRAINT "security_rate_limits_hash_check" CHECK ("security_rate_limits"."key_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX "security_rate_limits_expiry_idx" ON "security_rate_limits" USING btree ("expires_at");