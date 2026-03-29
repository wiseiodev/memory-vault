CREATE TYPE "public"."ingestion_stage" AS ENUM('extract', 'segment', 'embed', 'promote', 'complete');--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "stage" "ingestion_stage" DEFAULT 'extract' NOT NULL;--> statement-breakpoint
CREATE INDEX "ing_jobs_stage_status_idx" ON "ingestion_jobs" USING btree ("stage","status");