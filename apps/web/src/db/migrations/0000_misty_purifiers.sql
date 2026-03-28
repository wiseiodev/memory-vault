CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."memory_state" AS ENUM('active', 'superseded', 'invalidated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."cursor_status" AS ENUM('idle', 'running', 'errored');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('chrome_extension');--> statement-breakpoint
CREATE TYPE "public"."evaluation_kind" AS ENUM('import_quality', 'memory_quality', 'retrieval');--> statement-breakpoint
CREATE TYPE "public"."ingestion_job_kind" AS ENUM('embed', 'evaluate', 'extract', 'ingest', 'segment', 'sync');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."blob_extraction_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."blob_storage_provider" AS ENUM('external_url', 's3', 'vercel_blob');--> statement-breakpoint
CREATE TYPE "public"."segment_kind" AS ENUM('ocr', 'plain_text', 'quote', 'title', 'transcript');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('api', 'bookmark', 'chat', 'email', 'file', 'note', 'web_page');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('pending', 'processing', 'ready', 'failed', 'archived');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"created_by_user_id" text,
	"state" "memory_state" DEFAULT 'active' NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"summary" text,
	"confidence" double precision,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"last_observed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"superseded_by_memory_id" text,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memories_superseded_self_check" CHECK ("memories"."superseded_by_memory_id" is null or "memories"."superseded_by_memory_id" <> "memories"."id")
);
--> statement-breakpoint
CREATE TABLE "memory_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"memory_id" text NOT NULL,
	"source_item_id" text,
	"segment_id" text,
	"ordinal" integer NOT NULL,
	"quote_text" text,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_citations_target_check" CHECK ("memory_citations"."source_item_id" is not null or "memory_citations"."segment_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "connector_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"space_id" text,
	"connector_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"cursor" text,
	"status" "cursor_status" DEFAULT 'idle' NOT NULL,
	"synced_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"space_id" text,
	"platform" "device_platform" DEFAULT 'chrome_extension' NOT NULL,
	"label" text,
	"token_hash" text NOT NULL,
	"hash_algorithm" text DEFAULT 'sha256' NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_results" (
	"id" text PRIMARY KEY NOT NULL,
	"evaluation_run_id" text NOT NULL,
	"space_id" text NOT NULL,
	"memory_id" text,
	"segment_id" text,
	"source_item_id" text,
	"metric" text NOT NULL,
	"score" double precision,
	"passed" boolean,
	"rationale" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"created_by_user_id" text,
	"kind" "evaluation_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"dataset_key" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"source_item_id" text,
	"kind" "ingestion_job_kind" NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"connector_key" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"error_details" jsonb,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"source_item_id" text NOT NULL,
	"source_blob_id" text,
	"ordinal" integer NOT NULL,
	"kind" "segment_kind" DEFAULT 'plain_text' NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"token_count" integer,
	"char_start" integer,
	"char_end" integer,
	"embedding" vector(1536),
	"embedding_model" text,
	"embedded_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_item_id" text NOT NULL,
	"storage_provider" "blob_storage_provider" NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text,
	"content_type" text,
	"byte_size" bigint,
	"checksum_sha256" text,
	"etag" text,
	"extraction_status" "blob_extraction_status" DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"extracted_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_items" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"created_by_user_id" text,
	"kind" "source_kind" NOT NULL,
	"status" "source_status" DEFAULT 'pending' NOT NULL,
	"title" text,
	"canonical_uri" text,
	"connector_key" text,
	"external_id" text,
	"external_parent_id" text,
	"source_fingerprint" text,
	"checksum_sha256" text,
	"mime_type" text,
	"language_code" text,
	"captured_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_superseded_by_memory_id_memories_id_fk" FOREIGN KEY ("superseded_by_memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_citations" ADD CONSTRAINT "memory_citations_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_citations" ADD CONSTRAINT "memory_citations_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_citations" ADD CONSTRAINT "memory_citations_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_cursors" ADD CONSTRAINT "connector_cursors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_cursors" ADD CONSTRAINT "connector_cursors_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_run_id_evaluation_runs_id_fk" FOREIGN KEY ("evaluation_run_id") REFERENCES "public"."evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_results" ADD CONSTRAINT "evaluation_results_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_source_blob_id_source_blobs_id_fk" FOREIGN KEY ("source_blob_id") REFERENCES "public"."source_blobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_blobs" ADD CONSTRAINT "source_blobs_source_item_id_source_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_account_id_idx" ON "account" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_provider_id_idx" ON "account" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "memories_space_idx" ON "memories" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "memories_space_state_idx" ON "memories" USING btree ("space_id","state");--> statement-breakpoint
CREATE INDEX "memories_space_kind_idx" ON "memories" USING btree ("space_id","kind");--> statement-breakpoint
CREATE INDEX "memories_space_updated_idx" ON "memories" USING btree ("space_id","updated_at");--> statement-breakpoint
CREATE INDEX "memories_observed_idx" ON "memories" USING btree ("last_observed_at");--> statement-breakpoint
CREATE INDEX "memories_superseded_by_idx" ON "memories" USING btree ("superseded_by_memory_id");--> statement-breakpoint
CREATE INDEX "memories_embedded_idx" ON "memories" USING btree ("embedded_at");--> statement-breakpoint
CREATE INDEX "memories_content_fts_idx" ON "memories" USING gin (to_tsvector('simple', coalesce("title", '') || ' ' || "content" || ' ' || coalesce("summary", ''))) WHERE "memories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "memories_embedding_hnsw_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64) WHERE "memories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_citations_memory_ordinal_uidx" ON "memory_citations" USING btree ("memory_id","ordinal");--> statement-breakpoint
CREATE INDEX "memory_citations_segment_idx" ON "memory_citations" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "memory_citations_source_item_idx" ON "memory_citations" USING btree ("source_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_cursors_user_scope_uidx" ON "connector_cursors" USING btree ("user_id","connector_key","scope_key");--> statement-breakpoint
CREATE INDEX "connector_cursors_space_idx" ON "connector_cursors" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "connector_cursors_status_idx" ON "connector_cursors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "connector_cursors_synced_idx" ON "connector_cursors" USING btree ("synced_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_hash_uidx" ON "device_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_tokens_space_idx" ON "device_tokens" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "device_tokens_platform_idx" ON "device_tokens" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "device_tokens_revoked_idx" ON "device_tokens" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "evaluation_results_run_idx" ON "evaluation_results" USING btree ("evaluation_run_id");--> statement-breakpoint
CREATE INDEX "evaluation_results_space_metric_idx" ON "evaluation_results" USING btree ("space_id","metric");--> statement-breakpoint
CREATE INDEX "evaluation_results_memory_idx" ON "evaluation_results" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "evaluation_results_segment_idx" ON "evaluation_results" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "evaluation_results_source_item_idx" ON "evaluation_results" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_space_idx" ON "evaluation_runs" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "evaluation_runs_kind_status_idx" ON "evaluation_runs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "evaluation_runs_created_idx" ON "evaluation_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ing_jobs_space_status_idx" ON "ingestion_jobs" USING btree ("space_id","status");--> statement-breakpoint
CREATE INDEX "ing_jobs_source_item_idx" ON "ingestion_jobs" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "ing_jobs_kind_status_idx" ON "ingestion_jobs" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX "ing_jobs_created_idx" ON "ingestion_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_item_ordinal_uidx" ON "segments" USING btree ("source_item_id","ordinal");--> statement-breakpoint
CREATE INDEX "segments_blob_idx" ON "segments" USING btree ("source_blob_id");--> statement-breakpoint
CREATE INDEX "segments_item_hash_idx" ON "segments" USING btree ("source_item_id","content_hash");--> statement-breakpoint
CREATE INDEX "segments_embedded_idx" ON "segments" USING btree ("embedded_at");--> statement-breakpoint
CREATE INDEX "segments_item_created_idx" ON "segments" USING btree ("source_item_id","created_at");--> statement-breakpoint
CREATE INDEX "segments_content_fts_idx" ON "segments" USING gin (to_tsvector('simple', "content")) WHERE "segments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "segments_embedding_hnsw_idx" ON "segments" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64) WHERE "segments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "src_blobs_object_key_uidx" ON "source_blobs" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "src_blobs_item_idx" ON "source_blobs" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "src_blobs_checksum_idx" ON "source_blobs" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE INDEX "src_blobs_uploaded_idx" ON "source_blobs" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "src_items_space_idx" ON "source_items" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "src_items_space_status_idx" ON "source_items" USING btree ("space_id","status");--> statement-breakpoint
CREATE INDEX "src_items_space_captured_idx" ON "source_items" USING btree ("space_id","captured_at");--> statement-breakpoint
CREATE INDEX "src_items_created_by_idx" ON "source_items" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "src_items_connector_ext_idx" ON "source_items" USING btree ("connector_key","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "src_items_space_connector_ext_uidx" ON "source_items" USING btree ("space_id","connector_key","external_id") WHERE "source_items"."deleted_at" is null and "source_items"."connector_key" is not null and "source_items"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "src_items_space_fp_idx" ON "source_items" USING btree ("space_id","source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "src_items_space_fp_uidx" ON "source_items" USING btree ("space_id","source_fingerprint") WHERE "source_items"."deleted_at" is null and "source_items"."source_fingerprint" is not null;--> statement-breakpoint
CREATE INDEX "src_items_checksum_idx" ON "source_items" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE INDEX "src_items_uri_idx" ON "source_items" USING btree ("canonical_uri");--> statement-breakpoint
CREATE INDEX "spaces_owner_idx" ON "spaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "spaces_owner_created_idx" ON "spaces" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_owner_slug_uidx" ON "spaces" USING btree ("owner_user_id","slug") WHERE "spaces"."slug" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_owner_default_uidx" ON "spaces" USING btree ("owner_user_id") WHERE "spaces"."is_default" = true and "spaces"."deleted_at" is null;
