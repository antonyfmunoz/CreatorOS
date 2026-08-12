CREATE TABLE "relationship_native_delivery_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"direct_message_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_native_delivery_business_key_unique" UNIQUE("business_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "relationship_native_delivery_receipts" ADD CONSTRAINT "relationship_native_delivery_receipts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_native_delivery_receipts" ADD CONSTRAINT "relationship_native_delivery_receipts_direct_message_id_direct_messages_id_fk" FOREIGN KEY ("direct_message_id") REFERENCES "public"."direct_messages"("id") ON DELETE cascade ON UPDATE no action;