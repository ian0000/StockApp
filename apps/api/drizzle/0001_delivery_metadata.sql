CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"status" text NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suppression_identifier" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deletion_requests_status_nonempty" CHECK (length(btrim("deletion_requests"."status")) > 0),
	CONSTRAINT "deletion_requests_progress_object" CHECK (jsonb_typeof("deletion_requests"."progress") = 'object'),
	CONSTRAINT "deletion_requests_updated_at_valid" CHECK ("deletion_requests"."updated_at" >= "deletion_requests"."requested_at")
);
--> statement-breakpoint
CREATE TABLE "import_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"inventory_id" uuid NOT NULL,
	"expected_empty_generation" uuid NOT NULL,
	"bytes" bigint NOT NULL,
	"chunks" integer NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consent_recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "import_sessions_business_hash_unique" UNIQUE("business_id","hash"),
	CONSTRAINT "import_sessions_hash_shape" CHECK ("import_sessions"."hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "import_sessions_size_nonnegative" CHECK ("import_sessions"."bytes" >= 0 AND "import_sessions"."chunks" >= 0),
	CONSTRAINT "import_sessions_status_nonempty" CHECK (length(btrim("import_sessions"."status")) > 0),
	CONSTRAINT "import_sessions_expiry_valid" CHECK ("import_sessions"."expires_at" > "import_sessions"."consent_recorded_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_change_sets" (
	"inventory_id" uuid NOT NULL,
	"revision" bigint NOT NULL,
	"changes" jsonb NOT NULL,
	"server_recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_change_sets_inventory_id_revision_pk" PRIMARY KEY("inventory_id","revision"),
	CONSTRAINT "inventory_change_sets_revision_nonnegative" CHECK ("inventory_change_sets"."revision" >= 0),
	CONSTRAINT "inventory_change_sets_changes_object" CHECK (jsonb_typeof("inventory_change_sets"."changes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"business_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"kind" text NOT NULL,
	"result_code" text NOT NULL,
	"result_references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"committed_revision" bigint,
	"device_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_receipts_business_id_operation_id_pk" PRIMARY KEY("business_id","operation_id"),
	CONSTRAINT "operation_receipts_hash_shape" CHECK ("operation_receipts"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "operation_receipts_kind_nonempty" CHECK (length(btrim("operation_receipts"."kind")) > 0),
	CONSTRAINT "operation_receipts_result_nonempty" CHECK (length(btrim("operation_receipts"."result_code")) > 0),
	CONSTRAINT "operation_receipts_references_object" CHECK (jsonb_typeof("operation_receipts"."result_references") = 'object'),
	CONSTRAINT "operation_receipts_revision_nonnegative" CHECK ("operation_receipts"."committed_revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sync_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"protocol_version" integer NOT NULL,
	"domain_version" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_devices_business_id_id_unique" UNIQUE("business_id","id"),
	CONSTRAINT "sync_devices_protocol_positive" CHECK ("sync_devices"."protocol_version" > 0),
	CONSTRAINT "sync_devices_domain_version_nonempty" CHECK (length(btrim("sync_devices"."domain_version")) > 0)
);
--> statement-breakpoint
ALTER TABLE "inventories" ADD COLUMN "generation" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "inventories" ADD COLUMN "revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "reversal_of_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_states" ADD COLUMN "state_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_states" ADD COLUMN "last_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "metadata_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_change_sets" ADD CONSTRAINT "inventory_change_sets_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_device_fk" FOREIGN KEY ("business_id","device_id") REFERENCES "public"."sync_devices"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_sessions_business_status_idx" ON "import_sessions" USING btree ("business_id","status");--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reversal_fk" FOREIGN KEY ("inventory_id","product_id","reversal_of_movement_id") REFERENCES "public"."inventory_movements"("inventory_id","product_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_states" ADD CONSTRAINT "inventory_states_last_movement_fk" FOREIGN KEY ("inventory_id","product_id","last_movement_id") REFERENCES "public"."inventory_movements"("inventory_id","product_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_reversal_unique" ON "inventory_movements" USING btree ("inventory_id","reversal_of_movement_id") WHERE "inventory_movements"."reversal_of_movement_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_business_id_id_unique" UNIQUE("business_id","id");--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_revision_nonnegative" CHECK ("inventories"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reversal_type_valid" CHECK ("inventory_movements"."reversal_of_movement_id" IS NULL OR ("inventory_movements"."type" = 'REVERSAL' AND "inventory_movements"."reversal_of_movement_id" <> "inventory_movements"."id"));--> statement-breakpoint
ALTER TABLE "inventory_states" ADD CONSTRAINT "inventory_states_revision_nonnegative" CHECK ("inventory_states"."state_revision" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_metadata_revision_nonnegative" CHECK ("products"."metadata_revision" >= 0);