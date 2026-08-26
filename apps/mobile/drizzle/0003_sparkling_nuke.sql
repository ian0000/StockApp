CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`product_id` text NOT NULL,
	`stock_before` integer NOT NULL,
	`actual_stock` integer NOT NULL,
	`difference` integer NOT NULL,
	`reason` text NOT NULL,
	`cost_mode` text,
	`unit_cost_units` integer NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inventory_id`,`product_id`) REFERENCES `products`(`inventory_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_adjustments_actual_stock_nonnegative" CHECK("stock_adjustments"."actual_stock" >= 0),
	CONSTRAINT "stock_adjustments_difference_nonzero" CHECK("stock_adjustments"."difference" <> 0),
	CONSTRAINT "stock_adjustments_stock_transition_valid" CHECK("stock_adjustments"."actual_stock" = "stock_adjustments"."stock_before" + "stock_adjustments"."difference"),
	CONSTRAINT "stock_adjustments_reason_valid" CHECK("stock_adjustments"."reason" in ('COUNT_CORRECTION', 'DAMAGED', 'LOST', 'INTERNAL_USE', 'OTHER')),
	CONSTRAINT "stock_adjustments_reason_direction_valid" CHECK("stock_adjustments"."difference" < 0 or ("stock_adjustments"."difference" > 0 and "stock_adjustments"."reason" in ('COUNT_CORRECTION', 'OTHER'))),
	CONSTRAINT "stock_adjustments_cost_mode_valid" CHECK("stock_adjustments"."cost_mode" is null or "stock_adjustments"."cost_mode" in ('USE_CURRENT_COST', 'CUSTOM_COST')),
	CONSTRAINT "stock_adjustments_cost_mode_direction_valid" CHECK(("stock_adjustments"."difference" > 0 and "stock_adjustments"."cost_mode" is not null) or ("stock_adjustments"."difference" < 0 and "stock_adjustments"."cost_mode" is null)),
	CONSTRAINT "stock_adjustments_unit_cost_nonnegative" CHECK("stock_adjustments"."unit_cost_units" >= 0),
	CONSTRAINT "stock_adjustments_effective_at_nonnegative" CHECK("stock_adjustments"."effective_at" >= 0),
	CONSTRAINT "stock_adjustments_created_at_nonnegative" CHECK("stock_adjustments"."created_at" >= 0),
	CONSTRAINT "stock_adjustments_updated_at_valid" CHECK("stock_adjustments"."updated_at" >= 0 and "stock_adjustments"."updated_at" >= "stock_adjustments"."created_at")
);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_inventory_effective_at_idx` ON `stock_adjustments` (`inventory_id`,`effective_at`);