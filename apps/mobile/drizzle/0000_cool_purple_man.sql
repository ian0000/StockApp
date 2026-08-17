CREATE TABLE `inventories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "inventories_created_at_nonnegative" CHECK("inventories"."created_at" >= 0),
	CONSTRAINT "inventories_updated_at_valid" CHECK("inventories"."updated_at" >= "inventories"."created_at")
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`unit_cost_snapshot_units` integer,
	`stock_before` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`source_type` text,
	`source_id` text,
	`metadata` text,
	`effective_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inventory_id`,`product_id`) REFERENCES `products`(`inventory_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_movements_type_valid" CHECK("inventory_movements"."type" in ('INITIAL_STOCK', 'PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL')),
	CONSTRAINT "inventory_movements_quantity_nonzero" CHECK("inventory_movements"."quantity_delta" <> 0),
	CONSTRAINT "inventory_movements_stock_transition_valid" CHECK("inventory_movements"."stock_after" = "inventory_movements"."stock_before" + "inventory_movements"."quantity_delta"),
	CONSTRAINT "inventory_movements_cost_nonnegative" CHECK("inventory_movements"."unit_cost_snapshot_units" is null or "inventory_movements"."unit_cost_snapshot_units" >= 0),
	CONSTRAINT "inventory_movements_source_pair_valid" CHECK(("inventory_movements"."source_type" is null and "inventory_movements"."source_id" is null) or ("inventory_movements"."source_type" is not null and "inventory_movements"."source_id" is not null)),
	CONSTRAINT "inventory_movements_effective_at_nonnegative" CHECK("inventory_movements"."effective_at" >= 0),
	CONSTRAINT "inventory_movements_created_at_nonnegative" CHECK("inventory_movements"."created_at" >= 0),
	CONSTRAINT "inventory_movements_updated_at_valid" CHECK("inventory_movements"."updated_at" >= "inventory_movements"."created_at")
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_inventory_effective_at_idx` ON `inventory_movements` (`inventory_id`,`effective_at`);--> statement-breakpoint
CREATE INDEX `inventory_movements_product_effective_at_idx` ON `inventory_movements` (`product_id`,`effective_at`);--> statement-breakpoint
CREATE TABLE `inventory_states` (
	`inventory_id` text NOT NULL,
	`product_id` text NOT NULL,
	`stock` integer NOT NULL,
	`unit_cost_units` integer,
	PRIMARY KEY(`inventory_id`, `product_id`),
	FOREIGN KEY (`inventory_id`,`product_id`) REFERENCES `products`(`inventory_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "inventory_states_unit_cost_nonnegative" CHECK("inventory_states"."unit_cost_units" is null or "inventory_states"."unit_cost_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`name` text NOT NULL,
	`variant` text,
	`barcode` text,
	`regular_sale_price_units` integer NOT NULL,
	`minimum_stock` integer,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_regular_sale_price_nonnegative" CHECK("products"."regular_sale_price_units" >= 0),
	CONSTRAINT "products_minimum_stock_nonnegative" CHECK("products"."minimum_stock" is null or "products"."minimum_stock" >= 0),
	CONSTRAINT "products_is_archived_boolean" CHECK("products"."is_archived" in (0, 1)),
	CONSTRAINT "products_created_at_nonnegative" CHECK("products"."created_at" >= 0),
	CONSTRAINT "products_updated_at_valid" CHECK("products"."updated_at" >= "products"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_inventory_id_id_unique` ON `products` (`inventory_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_active_barcode_unique` ON `products` (`inventory_id`,`barcode`) WHERE "products"."barcode" is not null and "products"."is_archived" = 0;--> statement-breakpoint
CREATE INDEX `products_inventory_id_idx` ON `products` (`inventory_id`);