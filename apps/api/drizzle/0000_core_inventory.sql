CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"cloud_access_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_owner_user_id_unique" UNIQUE("owner_user_id"),
	CONSTRAINT "businesses_owner_nonempty" CHECK (length(btrim("businesses"."owner_user_id")) > 0),
	CONSTRAINT "businesses_status_valid" CHECK ("businesses"."status" IN ('ACTIVE','DELETING')),
	CONSTRAINT "businesses_updated_at_valid" CHECK ("businesses"."updated_at" >= "businesses"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"reporting_time_zone" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "inventories_business_id_unique" UNIQUE("business_id"),
	CONSTRAINT "inventories_name_nonempty" CHECK (length(btrim("inventories"."name")) > 0),
	CONSTRAINT "inventories_currency_shape" CHECK ("inventories"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "inventories_timezone_nonempty" CHECK (length(btrim("inventories"."reporting_time_zone")) > 0),
	CONSTRAINT "inventories_created_at_safe" CHECK ("inventories"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventories_updated_at_safe" CHECK ("inventories"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventories_updated_at_valid" CHECK ("inventories"."updated_at" >= "inventories"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity_delta" bigint NOT NULL,
	"unit_cost_snapshot_units" bigint,
	"stock_before" bigint NOT NULL,
	"stock_after" bigint NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"metadata" text,
	"effective_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "inventory_movements_inventory_id_id_unique" UNIQUE("inventory_id","id"),
	CONSTRAINT "inventory_movements_inventory_product_id_unique" UNIQUE("inventory_id","product_id","id"),
	CONSTRAINT "inventory_movements_type_valid" CHECK ("inventory_movements"."type" IN ('INITIAL_STOCK','PURCHASE','SALE','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL')),
	CONSTRAINT "inventory_movements_delta_safe" CHECK ("inventory_movements"."quantity_delta" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "inventory_movements_stock_before_safe" CHECK ("inventory_movements"."stock_before" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "inventory_movements_stock_after_safe" CHECK ("inventory_movements"."stock_after" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "inventory_movements_cost_safe" CHECK ("inventory_movements"."unit_cost_snapshot_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventory_movements_delta_nonzero" CHECK ("inventory_movements"."quantity_delta" <> 0),
	CONSTRAINT "inventory_movements_transition_valid" CHECK ("inventory_movements"."stock_after" = "inventory_movements"."stock_before" + "inventory_movements"."quantity_delta"),
	CONSTRAINT "inventory_movements_source_pair_valid" CHECK (("inventory_movements"."source_type" IS NULL AND "inventory_movements"."source_id" IS NULL) OR ("inventory_movements"."source_type" IS NOT NULL AND "inventory_movements"."source_id" IS NOT NULL)),
	CONSTRAINT "inventory_movements_metadata_v1" CHECK ("inventory_movements"."metadata" IS NULL),
	CONSTRAINT "inventory_movements_effective_at_safe" CHECK ("inventory_movements"."effective_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventory_movements_created_at_safe" CHECK ("inventory_movements"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventory_movements_updated_at_safe" CHECK ("inventory_movements"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventory_movements_updated_at_valid" CHECK ("inventory_movements"."updated_at" >= "inventory_movements"."created_at")
);
--> statement-breakpoint
CREATE TABLE "inventory_states" (
	"inventory_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"stock" bigint NOT NULL,
	"unit_cost_units" bigint,
	CONSTRAINT "inventory_states_inventory_id_product_id_pk" PRIMARY KEY("inventory_id","product_id"),
	CONSTRAINT "inventory_states_stock_safe" CHECK ("inventory_states"."stock" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "inventory_states_cost_safe" CHECK ("inventory_states"."unit_cost_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "inventory_states_positive_stock_cost_required" CHECK ("inventory_states"."stock" <= 0 OR "inventory_states"."unit_cost_units" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"variant" text,
	"barcode" text,
	"regular_sale_price_units" bigint NOT NULL,
	"minimum_stock" bigint,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "products_inventory_id_id_unique" UNIQUE("inventory_id","id"),
	CONSTRAINT "products_name_nonempty" CHECK (length(btrim("products"."name")) > 0),
	CONSTRAINT "products_regular_sale_price_safe" CHECK ("products"."regular_sale_price_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "products_minimum_stock_safe" CHECK ("products"."minimum_stock" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "products_created_at_safe" CHECK ("products"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "products_updated_at_safe" CHECK ("products"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "products_updated_at_valid" CHECK ("products"."updated_at" >= "products"."created_at")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_cost_units" bigint NOT NULL,
	"total_amount_units" bigint NOT NULL,
	"stock_before" bigint NOT NULL,
	"stock_after" bigint NOT NULL,
	"average_cost_before_units" bigint,
	"average_cost_after_units" bigint NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"notes" text,
	"effective_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "purchases_quantity_safe" CHECK ("purchases"."quantity" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_quantity_positive" CHECK ("purchases"."quantity" > 0),
	CONSTRAINT "purchases_unit_cost_safe" CHECK ("purchases"."unit_cost_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_total_safe" CHECK ("purchases"."total_amount_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_stock_before_safe" CHECK ("purchases"."stock_before" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "purchases_stock_after_safe" CHECK ("purchases"."stock_after" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "purchases_average_before_safe" CHECK ("purchases"."average_cost_before_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_average_after_safe" CHECK ("purchases"."average_cost_after_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_status_valid" CHECK ("purchases"."status" IN ('CONFIRMED','VOIDED')),
	CONSTRAINT "purchases_total_valid" CHECK ("purchases"."total_amount_units" = "purchases"."quantity" * "purchases"."unit_cost_units"),
	CONSTRAINT "purchases_stock_transition_valid" CHECK ("purchases"."stock_after" = "purchases"."stock_before" + "purchases"."quantity"),
	CONSTRAINT "purchases_positive_stock_cost_required" CHECK ("purchases"."stock_before" <= 0 OR "purchases"."average_cost_before_units" IS NOT NULL),
	CONSTRAINT "purchases_nonpositive_stock_cost_valid" CHECK ("purchases"."stock_before" > 0 OR "purchases"."average_cost_after_units" = "purchases"."unit_cost_units"),
	CONSTRAINT "purchases_effective_at_safe" CHECK ("purchases"."effective_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_created_at_safe" CHECK ("purchases"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_updated_at_safe" CHECK ("purchases"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "purchases_updated_at_valid" CHECK ("purchases"."updated_at" >= "purchases"."created_at")
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" bigint NOT NULL,
	"unit_sale_price_units" bigint NOT NULL,
	"subtotal_units" bigint NOT NULL,
	"unit_cost_snapshot_units" bigint,
	"estimated_cost_units" bigint,
	"estimated_profit_units" bigint,
	"cost_status" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "sale_items_quantity_safe" CHECK ("sale_items"."quantity" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_price_safe" CHECK ("sale_items"."unit_sale_price_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_subtotal_safe" CHECK ("sale_items"."subtotal_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_snapshot_safe" CHECK ("sale_items"."unit_cost_snapshot_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_cost_safe" CHECK ("sale_items"."estimated_cost_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_profit_safe" CHECK ("sale_items"."estimated_profit_units" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "sale_items_quantity_price_positive" CHECK ("sale_items"."quantity" > 0 AND "sale_items"."unit_sale_price_units" > 0),
	CONSTRAINT "sale_items_subtotal_valid" CHECK ("sale_items"."subtotal_units" = "sale_items"."quantity" * "sale_items"."unit_sale_price_units"),
	CONSTRAINT "sale_items_cost_state_valid" CHECK (("sale_items"."cost_status" = 'KNOWN' AND "sale_items"."unit_cost_snapshot_units" IS NOT NULL AND "sale_items"."estimated_cost_units" IS NOT NULL AND "sale_items"."estimated_profit_units" IS NOT NULL AND "sale_items"."estimated_cost_units" = "sale_items"."quantity" * "sale_items"."unit_cost_snapshot_units" AND "sale_items"."estimated_profit_units" = "sale_items"."subtotal_units" - "sale_items"."estimated_cost_units") OR ("sale_items"."cost_status" = 'UNKNOWN' AND "sale_items"."unit_cost_snapshot_units" IS NULL AND "sale_items"."estimated_cost_units" IS NULL AND "sale_items"."estimated_profit_units" IS NULL)),
	CONSTRAINT "sale_items_created_at_safe" CHECK ("sale_items"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_updated_at_safe" CHECK ("sale_items"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sale_items_updated_at_valid" CHECK ("sale_items"."updated_at" >= "sale_items"."created_at")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"total_amount_units" bigint NOT NULL,
	"estimated_cost_units" bigint,
	"estimated_profit_units" bigint,
	"notes" text,
	"effective_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "sales_inventory_id_id_unique" UNIQUE("inventory_id","id"),
	CONSTRAINT "sales_status_valid" CHECK ("sales"."status" IN ('CONFIRMED','VOIDED')),
	CONSTRAINT "sales_total_safe" CHECK ("sales"."total_amount_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sales_total_positive" CHECK ("sales"."total_amount_units" > 0),
	CONSTRAINT "sales_cost_safe" CHECK ("sales"."estimated_cost_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sales_profit_safe" CHECK ("sales"."estimated_profit_units" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "sales_estimates_pair_valid" CHECK (("sales"."estimated_cost_units" IS NULL AND "sales"."estimated_profit_units" IS NULL) OR ("sales"."estimated_cost_units" IS NOT NULL AND "sales"."estimated_profit_units" IS NOT NULL)),
	CONSTRAINT "sales_profit_valid" CHECK ("sales"."estimated_profit_units" IS NULL OR "sales"."estimated_profit_units" = "sales"."total_amount_units" - "sales"."estimated_cost_units"),
	CONSTRAINT "sales_effective_at_safe" CHECK ("sales"."effective_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sales_created_at_safe" CHECK ("sales"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sales_updated_at_safe" CHECK ("sales"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "sales_updated_at_valid" CHECK ("sales"."updated_at" >= "sales"."created_at")
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"stock_before" bigint NOT NULL,
	"actual_stock" bigint NOT NULL,
	"difference" bigint NOT NULL,
	"reason" text NOT NULL,
	"cost_mode" text,
	"unit_cost_units" bigint NOT NULL,
	"effective_at" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "stock_adjustments_stock_before_safe" CHECK ("stock_adjustments"."stock_before" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_actual_stock_safe" CHECK ("stock_adjustments"."actual_stock" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_difference_safe" CHECK ("stock_adjustments"."difference" BETWEEN -9007199254740991 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_cost_safe" CHECK ("stock_adjustments"."unit_cost_units" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_difference_nonzero" CHECK ("stock_adjustments"."difference" <> 0),
	CONSTRAINT "stock_adjustments_transition_valid" CHECK ("stock_adjustments"."actual_stock" = "stock_adjustments"."stock_before" + "stock_adjustments"."difference"),
	CONSTRAINT "stock_adjustments_reason_valid" CHECK ("stock_adjustments"."reason" IN ('COUNT_CORRECTION','DAMAGED','LOST','INTERNAL_USE','OTHER')),
	CONSTRAINT "stock_adjustments_reason_direction_valid" CHECK ("stock_adjustments"."difference" < 0 OR "stock_adjustments"."reason" IN ('COUNT_CORRECTION','OTHER')),
	CONSTRAINT "stock_adjustments_cost_mode_direction_valid" CHECK (("stock_adjustments"."difference" > 0 AND "stock_adjustments"."cost_mode" IS NOT NULL AND "stock_adjustments"."cost_mode" IN ('USE_CURRENT_COST','CUSTOM_COST')) OR ("stock_adjustments"."difference" < 0 AND "stock_adjustments"."cost_mode" IS NULL)),
	CONSTRAINT "stock_adjustments_effective_at_safe" CHECK ("stock_adjustments"."effective_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_created_at_safe" CHECK ("stock_adjustments"."created_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_updated_at_safe" CHECK ("stock_adjustments"."updated_at" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "stock_adjustments_updated_at_valid" CHECK ("stock_adjustments"."updated_at" >= "stock_adjustments"."created_at")
);
--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_fk" FOREIGN KEY ("inventory_id","product_id") REFERENCES "public"."products"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_states" ADD CONSTRAINT "inventory_states_product_fk" FOREIGN KEY ("inventory_id","product_id") REFERENCES "public"."products"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_fk" FOREIGN KEY ("inventory_id","product_id") REFERENCES "public"."products"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_fk" FOREIGN KEY ("inventory_id","sale_id") REFERENCES "public"."sales"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_fk" FOREIGN KEY ("inventory_id","product_id") REFERENCES "public"."products"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_fk" FOREIGN KEY ("inventory_id","product_id") REFERENCES "public"."products"("inventory_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_inventory_history_idx" ON "inventory_movements" USING btree ("inventory_id","effective_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movements_product_history_idx" ON "inventory_movements" USING btree ("inventory_id","product_id","effective_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "inventory_movements_source_idx" ON "inventory_movements" USING btree ("inventory_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_active_barcode_unique" ON "products" USING btree ("inventory_id","barcode") WHERE "products"."barcode" IS NOT NULL AND "products"."is_archived" = false;--> statement-breakpoint
CREATE INDEX "products_inventory_created_idx" ON "products" USING btree ("inventory_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "purchases_inventory_history_idx" ON "purchases" USING btree ("inventory_id","effective_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sale_items_inventory_sale_idx" ON "sale_items" USING btree ("inventory_id","sale_id");--> statement-breakpoint
CREATE INDEX "sales_inventory_history_idx" ON "sales" USING btree ("inventory_id","effective_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_adjustments_inventory_history_idx" ON "stock_adjustments" USING btree ("inventory_id","effective_at" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);