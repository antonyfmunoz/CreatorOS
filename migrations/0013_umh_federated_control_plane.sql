ALTER TABLE "projection_events" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "projection_events" ADD COLUMN "next_delivery_at" timestamp;
--> statement-breakpoint
ALTER TABLE "projection_events" ADD COLUMN "delivery_locked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "projection_events" ADD COLUMN "last_delivery_error" text;
--> statement-breakpoint
CREATE TABLE "umh_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_id" uuid NOT NULL,
  "command_type" text NOT NULL,
  "schema_version" text DEFAULT 'umh.command.v1' NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "business_id" uuid,
  "delegated_user_id" integer,
  "payload" json DEFAULT '{}' NOT NULL,
  "idempotency_key" text NOT NULL,
  "trace_id" text NOT NULL,
  "issued_at" timestamp NOT NULL,
  "expires_at" timestamp NOT NULL,
  "executed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_commands_command_id_unique" UNIQUE("command_id"),
  CONSTRAINT "umh_commands_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "umh_commands" ADD CONSTRAINT "umh_commands_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_commands" ADD CONSTRAINT "umh_commands_delegated_user_id_users_id_fk" FOREIGN KEY ("delegated_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "umh_command_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_id" uuid NOT NULL,
  "status" text NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "payload" json DEFAULT '{}' NOT NULL,
  "trace_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "umh_command_outcomes" ADD CONSTRAINT "umh_command_outcomes_command_id_umh_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."umh_commands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "umh_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_id" uuid NOT NULL,
  "business_id" uuid,
  "status" text DEFAULT 'pending' NOT NULL,
  "reason" text NOT NULL,
  "approved_by_user_id" integer,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_approvals_command_id_unique" UNIQUE("command_id")
);
--> statement-breakpoint
ALTER TABLE "umh_approvals" ADD CONSTRAINT "umh_approvals_command_id_umh_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."umh_commands"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_approvals" ADD CONSTRAINT "umh_approvals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_approvals" ADD CONSTRAINT "umh_approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "umh_audit_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "command_id" uuid,
  "action" text NOT NULL,
  "result" text NOT NULL,
  "business_id" uuid,
  "actor_user_id" integer,
  "trace_id" text NOT NULL,
  "metadata" json DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD CONSTRAINT "umh_audit_records_command_id_umh_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."umh_commands"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD CONSTRAINT "umh_audit_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "umh_audit_records" ADD CONSTRAINT "umh_audit_records_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "umh_nonces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nonce" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "umh_nonces_nonce_unique" UNIQUE("nonce")
);
