CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_sale_price_units` integer NOT NULL,
	`subtotal_units` integer NOT NULL,
	`unit_cost_snapshot_units` integer,
	`estimated_cost_units` integer,
	`estimated_profit_units` integer,
	`cost_status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_items_quantity_positive" CHECK("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_unit_sale_price_positive" CHECK("sale_items"."unit_sale_price_units" > 0),
	CONSTRAINT "sale_items_subtotal_positive" CHECK("sale_items"."subtotal_units" > 0),
	CONSTRAINT "sale_items_cost_status_valid" CHECK("sale_items"."cost_status" in ('KNOWN', 'UNKNOWN')),
	CONSTRAINT "sale_items_cost_state_valid" CHECK(("sale_items"."cost_status" = 'KNOWN' and "sale_items"."unit_cost_snapshot_units" is not null and "sale_items"."estimated_cost_units" is not null and "sale_items"."estimated_profit_units" is not null and "sale_items"."unit_cost_snapshot_units" >= 0 and "sale_items"."estimated_cost_units" >= 0 and "sale_items"."estimated_profit_units" = "sale_items"."subtotal_units" - "sale_items"."estimated_cost_units") or ("sale_items"."cost_status" = 'UNKNOWN' and "sale_items"."unit_cost_snapshot_units" is null and "sale_items"."estimated_cost_units" is null and "sale_items"."estimated_profit_units" is null)),
	CONSTRAINT "sale_items_created_at_nonnegative" CHECK("sale_items"."created_at" >= 0),
	CONSTRAINT "sale_items_updated_at_valid" CHECK("sale_items"."updated_at" >= "sale_items"."created_at")
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_id_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status` text NOT NULL,
	`total_amount_units` integer NOT NULL,
	`estimated_cost_units` integer,
	`estimated_profit_units` integer,
	`notes` text,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_status_valid" CHECK("sales"."status" in ('CONFIRMED', 'VOIDED')),
	CONSTRAINT "sales_total_amount_positive" CHECK("sales"."total_amount_units" > 0),
	CONSTRAINT "sales_estimates_pair_valid" CHECK(("sales"."estimated_cost_units" is null and "sales"."estimated_profit_units" is null) or ("sales"."estimated_cost_units" is not null and "sales"."estimated_profit_units" is not null)),
	CONSTRAINT "sales_estimated_cost_nonnegative" CHECK("sales"."estimated_cost_units" is null or "sales"."estimated_cost_units" >= 0),
	CONSTRAINT "sales_estimated_profit_valid" CHECK("sales"."estimated_profit_units" is null or "sales"."estimated_profit_units" = "sales"."total_amount_units" - "sales"."estimated_cost_units"),
	CONSTRAINT "sales_effective_at_nonnegative" CHECK("sales"."effective_at" >= 0),
	CONSTRAINT "sales_created_at_nonnegative" CHECK("sales"."created_at" >= 0),
	CONSTRAINT "sales_updated_at_valid" CHECK("sales"."updated_at" >= "sales"."created_at")
);
--> statement-breakpoint
CREATE INDEX `sales_inventory_effective_at_idx` ON `sales` (`inventory_id`,`effective_at`);--> statement-breakpoint
CREATE INDEX `inventory_movements_source_idx` ON `inventory_movements` (`source_type`,`source_id`);