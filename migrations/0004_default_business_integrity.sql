CREATE UNIQUE INDEX "businesses_one_default_per_owner" ON "businesses" USING btree ("owner_user_id") WHERE "businesses"."is_default" = true;
