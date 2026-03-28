DROP INDEX "spaces_owner_slug_uidx";--> statement-breakpoint
DROP INDEX "spaces_owner_default_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_owner_slug_uidx" ON "spaces" USING btree ("owner_user_id","slug") WHERE "spaces"."slug" is not null and "spaces"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_owner_default_uidx" ON "spaces" USING btree ("owner_user_id") WHERE "spaces"."is_default" = true and "spaces"."deleted_at" is null and "spaces"."archived_at" is null;