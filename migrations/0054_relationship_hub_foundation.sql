CREATE TABLE "relationship_agent_authority_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"agent_key" text NOT NULL,
	"role" text NOT NULL,
	"mode" text DEFAULT 'observe' NOT NULL,
	"allowed_actions" json DEFAULT '[]'::json NOT NULL,
	"approval_required_actions" json DEFAULT '[]'::json NOT NULL,
	"blocked_actions" json DEFAULT '[]'::json NOT NULL,
	"channel_allowlist" json DEFAULT '[]'::json NOT NULL,
	"max_cost_units_per_run" integer DEFAULT 100 NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_agent_authority_business_agent_unique" UNIQUE("business_id","agent_key")
);--> statement-breakpoint
CREATE TABLE "relationship_agent_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"relationship_id" uuid,
	"agent_key" text NOT NULL,
	"suggestion_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"evidence" json DEFAULT '[]'::json NOT NULL,
	"confidence" double precision,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_channel_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connected_by_user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider_account_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scopes" json DEFAULT '[]'::json NOT NULL,
	"capabilities" json DEFAULT '{}'::json NOT NULL,
	"access_token_ciphertext" text,
	"refresh_token_ciphertext" text,
	"webhook_secret_ciphertext" text,
	"token_expires_at" timestamp,
	"last_validated_at" timestamp,
	"last_inbound_at" timestamp,
	"last_outbound_at" timestamp,
	"last_error_code" text,
	"last_error_message" text,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_channel_connections_business_provider_account_unique" UNIQUE("business_id","provider","provider_account_id")
);--> statement-breakpoint
CREATE TABLE "relationship_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"external_identity_id" uuid,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"source" text DEFAULT 'observed' NOT NULL,
	"disclosure_version" text,
	"granted_at" timestamp,
	"expires_at" timestamp,
	"withdrawn_at" timestamp,
	"evidence" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_conversation_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"external_thread_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"capabilities" json DEFAULT '{}'::json NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_conversation_bindings_thread_unique" UNIQUE("business_id","provider","connection_id","external_thread_id")
);--> statement-breakpoint
CREATE TABLE "relationship_conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_user_id" integer,
	"body" text NOT NULL,
	"source_type" text DEFAULT 'human' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"relationship_id" uuid,
	"external_identity_id" uuid,
	"user_id" integer,
	"role" text DEFAULT 'customer' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);--> statement-breakpoint
CREATE TABLE "relationship_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid,
	"native_conversation_id" integer,
	"title" text NOT NULL,
	"kind" text DEFAULT 'direct' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"queue" text DEFAULT 'unassigned' NOT NULL,
	"assigned_to_user_id" integer,
	"ai_mode" text DEFAULT 'observe' NOT NULL,
	"last_message_at" timestamp,
	"snoozed_until" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_conversations_native_unique" UNIQUE("business_id","native_conversation_id")
);--> statement-breakpoint
CREATE TABLE "relationship_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"payload" json NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"claimed_by" text,
	"provider_request_id" text,
	"provider_message_id" text,
	"error_class" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "relationship_delivery_jobs_idempotency_unique" UNIQUE("business_id","idempotency_key")
);--> statement-breakpoint
CREATE TABLE "relationship_external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" text NOT NULL,
	"provider_subject_id" text NOT NULL,
	"address" text,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"verification_status" text DEFAULT 'observed' NOT NULL,
	"verified_at" timestamp,
	"last_seen_at" timestamp,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_external_identities_business_provider_subject_unique" UNIQUE("business_id","provider","provider_subject_id")
);--> statement-breakpoint
CREATE TABLE "relationship_memory_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"fact_type" text NOT NULL,
	"value" json NOT NULL,
	"epistemic_status" text DEFAULT 'inferred' NOT NULL,
	"confidence" double precision,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_merge_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source_relationship_id" uuid NOT NULL,
	"target_relationship_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"confidence" double precision NOT NULL,
	"evidence" json DEFAULT '[]'::json NOT NULL,
	"status" text DEFAULT 'suggested' NOT NULL,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_merge_candidates_pair_unique" UNIQUE("business_id","source_relationship_id","target_relationship_id")
);--> statement-breakpoint
CREATE TABLE "relationship_message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"attachment_type" text NOT NULL,
	"storage_key" text,
	"provider_media_id" text,
	"source_url" text,
	"filename" text,
	"mime_type" text,
	"size_bytes" bigint,
	"duration_ms" integer,
	"checksum" text,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_message_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"receipt_type" text NOT NULL,
	"provider_receipt_id" text,
	"occurred_at" timestamp NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"binding_id" uuid,
	"author_user_id" integer,
	"author_external_identity_id" uuid,
	"provider" text NOT NULL,
	"external_message_id" text,
	"direction" text NOT NULL,
	"author_type" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"body_format" text DEFAULT 'plain' NOT NULL,
	"reply_to_message_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"synthetic_media" boolean DEFAULT false NOT NULL,
	"disclosure" text,
	"occurred_at" timestamp NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_messages_binding_external_unique" UNIQUE("binding_id","external_message_id")
);--> statement-breakpoint
CREATE TABLE "relationship_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"author_user_id" integer,
	"body" text NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	"source_type" text DEFAULT 'human' NOT NULL,
	"source_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"normalized_payload" json NOT NULL,
	"raw_storage_key" text,
	"status" text DEFAULT 'received' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"error_code" text,
	"error_message" text,
	"occurred_at" timestamp NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "relationship_provider_events_external_unique" UNIQUE("connection_id","external_event_id")
);--> statement-breakpoint
CREATE TABLE "relationship_sync_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"stream" text NOT NULL,
	"cursor" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"next_sync_at" timestamp,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_sync_cursors_stream_unique" UNIQUE("connection_id","stream")
);--> statement-breakpoint
CREATE TABLE "relationship_tag_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_tag_assignments_unique" UNIQUE("relationship_id","tag_id")
);--> statement-breakpoint
CREATE TABLE "relationship_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_tags_business_name_unique" UNIQUE("business_id","name")
);--> statement-breakpoint
CREATE TABLE "relationship_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"relationship_id" uuid NOT NULL,
	"created_by_user_id" integer,
	"assigned_to_user_id" integer,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "relationship_voice_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"consent_version" text NOT NULL,
	"consent_text_hash" text NOT NULL,
	"status" text DEFAULT 'granted' NOT NULL,
	"verification_evidence" json DEFAULT '{}'::json NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp,
	CONSTRAINT "relationship_voice_consents_profile_version_unique" UNIQUE("voice_profile_id","consent_version")
);--> statement-breakpoint
CREATE TABLE "relationship_voice_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"voice_profile_id" uuid NOT NULL,
	"conversation_id" uuid,
	"requested_by_user_id" integer NOT NULL,
	"approved_by_user_id" integer,
	"source_type" text DEFAULT 'human' NOT NULL,
	"source_id" text,
	"script_ciphertext" text NOT NULL,
	"script_hash" text NOT NULL,
	"status" text DEFAULT 'awaiting_approval' NOT NULL,
	"provider_request_id" text,
	"storage_key" text,
	"mime_type" text,
	"duration_ms" integer,
	"size_bytes" bigint,
	"provenance" json DEFAULT '{}'::json NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"expires_at" timestamp
);--> statement-breakpoint
CREATE TABLE "relationship_voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"owner_user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_voice_id_ciphertext" text,
	"display_name" text NOT NULL,
	"clone_type" text DEFAULT 'professional' NOT NULL,
	"status" text DEFAULT 'enrollment_required' NOT NULL,
	"ownership_verification_status" text DEFAULT 'unverified' NOT NULL,
	"ownership_verified_at" timestamp,
	"disclosure_text" text DEFAULT 'AI-generated voice message sent with the voice owner''s authorization.' NOT NULL,
	"allowed_use_cases" json DEFAULT '[]'::json NOT NULL,
	"blocked_use_cases" json DEFAULT '[]'::json NOT NULL,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "relationship_voice_profiles_owner_name_unique" UNIQUE("business_id","owner_user_id","display_name")
);--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"created_by_user_id" integer,
	"owner_user_id" integer,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"relationship_type" text DEFAULT 'person' NOT NULL,
	"lifecycle_stage" text DEFAULT 'new' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"locale" text,
	"timezone" text,
	"ai_summary" text,
	"custom_fields" json DEFAULT '{}'::json NOT NULL,
	"last_interaction_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);--> statement-breakpoint
ALTER TABLE "relationship_agent_authority_policies" ADD CONSTRAINT "relationship_agent_authority_policies_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_agent_authority_policies" ADD CONSTRAINT "relationship_agent_authority_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_agent_suggestions" ADD CONSTRAINT "relationship_agent_suggestions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_agent_suggestions" ADD CONSTRAINT "relationship_agent_suggestions_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_agent_suggestions" ADD CONSTRAINT "relationship_agent_suggestions_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_agent_suggestions" ADD CONSTRAINT "relationship_agent_suggestions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_channel_connections" ADD CONSTRAINT "relationship_channel_connections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_channel_connections" ADD CONSTRAINT "relationship_channel_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_consents" ADD CONSTRAINT "relationship_consents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_consents" ADD CONSTRAINT "relationship_consents_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_consents" ADD CONSTRAINT "relationship_consents_external_identity_id_relationship_external_identities_id_fk" FOREIGN KEY ("external_identity_id") REFERENCES "public"."relationship_external_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_bindings" ADD CONSTRAINT "relationship_conversation_bindings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_bindings" ADD CONSTRAINT "relationship_conversation_bindings_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_bindings" ADD CONSTRAINT "relationship_conversation_bindings_connection_id_relationship_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."relationship_channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_notes" ADD CONSTRAINT "relationship_conversation_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_notes" ADD CONSTRAINT "relationship_conversation_notes_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_notes" ADD CONSTRAINT "relationship_conversation_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_participants" ADD CONSTRAINT "relationship_conversation_participants_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_participants" ADD CONSTRAINT "relationship_conversation_participants_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_participants" ADD CONSTRAINT "relationship_conversation_participants_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_participants" ADD CONSTRAINT "relationship_conversation_participants_external_identity_id_relationship_external_identities_id_fk" FOREIGN KEY ("external_identity_id") REFERENCES "public"."relationship_external_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversation_participants" ADD CONSTRAINT "relationship_conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversations" ADD CONSTRAINT "relationship_conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversations" ADD CONSTRAINT "relationship_conversations_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversations" ADD CONSTRAINT "relationship_conversations_native_conversation_id_conversations_id_fk" FOREIGN KEY ("native_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_conversations" ADD CONSTRAINT "relationship_conversations_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_delivery_jobs" ADD CONSTRAINT "relationship_delivery_jobs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_delivery_jobs" ADD CONSTRAINT "relationship_delivery_jobs_connection_id_relationship_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."relationship_channel_connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_delivery_jobs" ADD CONSTRAINT "relationship_delivery_jobs_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_delivery_jobs" ADD CONSTRAINT "relationship_delivery_jobs_message_id_relationship_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."relationship_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_external_identities" ADD CONSTRAINT "relationship_external_identities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_external_identities" ADD CONSTRAINT "relationship_external_identities_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_external_identities" ADD CONSTRAINT "relationship_external_identities_connection_id_relationship_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."relationship_channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_memory_facts" ADD CONSTRAINT "relationship_memory_facts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_memory_facts" ADD CONSTRAINT "relationship_memory_facts_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_memory_facts" ADD CONSTRAINT "relationship_memory_facts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_merge_candidates" ADD CONSTRAINT "relationship_merge_candidates_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_merge_candidates" ADD CONSTRAINT "relationship_merge_candidates_source_relationship_id_relationships_id_fk" FOREIGN KEY ("source_relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_merge_candidates" ADD CONSTRAINT "relationship_merge_candidates_target_relationship_id_relationships_id_fk" FOREIGN KEY ("target_relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_merge_candidates" ADD CONSTRAINT "relationship_merge_candidates_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_message_attachments" ADD CONSTRAINT "relationship_message_attachments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_message_attachments" ADD CONSTRAINT "relationship_message_attachments_message_id_relationship_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."relationship_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_message_receipts" ADD CONSTRAINT "relationship_message_receipts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_message_receipts" ADD CONSTRAINT "relationship_message_receipts_message_id_relationship_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."relationship_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_messages" ADD CONSTRAINT "relationship_messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_messages" ADD CONSTRAINT "relationship_messages_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_messages" ADD CONSTRAINT "relationship_messages_binding_id_relationship_conversation_bindings_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."relationship_conversation_bindings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_messages" ADD CONSTRAINT "relationship_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_messages" ADD CONSTRAINT "relationship_messages_author_external_identity_id_relationship_external_identities_id_fk" FOREIGN KEY ("author_external_identity_id") REFERENCES "public"."relationship_external_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_provider_events" ADD CONSTRAINT "relationship_provider_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_provider_events" ADD CONSTRAINT "relationship_provider_events_connection_id_relationship_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."relationship_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_sync_cursors" ADD CONSTRAINT "relationship_sync_cursors_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_sync_cursors" ADD CONSTRAINT "relationship_sync_cursors_connection_id_relationship_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."relationship_channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tag_assignments" ADD CONSTRAINT "relationship_tag_assignments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tag_assignments" ADD CONSTRAINT "relationship_tag_assignments_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tag_assignments" ADD CONSTRAINT "relationship_tag_assignments_tag_id_relationship_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."relationship_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tag_assignments" ADD CONSTRAINT "relationship_tag_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tags" ADD CONSTRAINT "relationship_tags_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tasks" ADD CONSTRAINT "relationship_tasks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tasks" ADD CONSTRAINT "relationship_tasks_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tasks" ADD CONSTRAINT "relationship_tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_tasks" ADD CONSTRAINT "relationship_tasks_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_consents" ADD CONSTRAINT "relationship_voice_consents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_consents" ADD CONSTRAINT "relationship_voice_consents_voice_profile_id_relationship_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."relationship_voice_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_consents" ADD CONSTRAINT "relationship_voice_consents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_generation_jobs" ADD CONSTRAINT "relationship_voice_generation_jobs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_generation_jobs" ADD CONSTRAINT "relationship_voice_generation_jobs_voice_profile_id_relationship_voice_profiles_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."relationship_voice_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_generation_jobs" ADD CONSTRAINT "relationship_voice_generation_jobs_conversation_id_relationship_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."relationship_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_generation_jobs" ADD CONSTRAINT "relationship_voice_generation_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_generation_jobs" ADD CONSTRAINT "relationship_voice_generation_jobs_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_profiles" ADD CONSTRAINT "relationship_voice_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_voice_profiles" ADD CONSTRAINT "relationship_voice_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationship_agent_suggestions_status_idx" ON "relationship_agent_suggestions" USING btree ("business_id","conversation_id","status","created_at");--> statement-breakpoint
CREATE INDEX "relationship_channel_connections_business_provider_idx" ON "relationship_channel_connections" USING btree ("business_id","provider","status");--> statement-breakpoint
CREATE INDEX "relationship_consents_relationship_purpose_idx" ON "relationship_consents" USING btree ("business_id","relationship_id","channel","purpose");--> statement-breakpoint
CREATE INDEX "relationship_conversation_notes_created_idx" ON "relationship_conversation_notes" USING btree ("business_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "relationship_conversation_participants_idx" ON "relationship_conversation_participants" USING btree ("business_id","conversation_id");--> statement-breakpoint
CREATE INDEX "relationship_conversations_queue_updated_idx" ON "relationship_conversations" USING btree ("business_id","queue","status","updated_at");--> statement-breakpoint
CREATE INDEX "relationship_delivery_jobs_due_idx" ON "relationship_delivery_jobs" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "relationship_external_identities_relationship_idx" ON "relationship_external_identities" USING btree ("business_id","relationship_id");--> statement-breakpoint
CREATE INDEX "relationship_memory_facts_status_idx" ON "relationship_memory_facts" USING btree ("business_id","relationship_id","status");--> statement-breakpoint
CREATE INDEX "relationship_message_attachments_message_idx" ON "relationship_message_attachments" USING btree ("business_id","message_id");--> statement-breakpoint
CREATE INDEX "relationship_message_receipts_message_idx" ON "relationship_message_receipts" USING btree ("business_id","message_id","occurred_at");--> statement-breakpoint
CREATE INDEX "relationship_messages_conversation_occurred_idx" ON "relationship_messages" USING btree ("business_id","conversation_id","occurred_at");--> statement-breakpoint
CREATE INDEX "relationship_notes_relationship_created_idx" ON "relationship_notes" USING btree ("business_id","relationship_id","created_at");--> statement-breakpoint
CREATE INDEX "relationship_provider_events_due_idx" ON "relationship_provider_events" USING btree ("status","next_attempt_at","received_at");--> statement-breakpoint
CREATE INDEX "relationship_tasks_assignee_status_idx" ON "relationship_tasks" USING btree ("business_id","assigned_to_user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "relationship_voice_generation_status_idx" ON "relationship_voice_generation_jobs" USING btree ("business_id","status","created_at");--> statement-breakpoint
CREATE INDEX "relationships_business_updated_idx" ON "relationships" USING btree ("business_id","updated_at");--> statement-breakpoint
CREATE INDEX "relationships_business_owner_idx" ON "relationships" USING btree ("business_id","owner_user_id","status");
