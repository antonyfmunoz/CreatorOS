ALTER TABLE "broadcast_destinations"
  ADD COLUMN IF NOT EXISTS "output_layout" text NOT NULL DEFAULT 'program',
  ADD COLUMN IF NOT EXISTS "framing_mode" text NOT NULL DEFAULT 'fit';

ALTER TABLE "broadcast_destinations" DROP CONSTRAINT IF EXISTS "broadcast_destinations_output_layout_check";
ALTER TABLE "broadcast_destinations"
  ADD CONSTRAINT "broadcast_destinations_output_layout_check"
  CHECK ("output_layout" IN ('program', 'landscape', 'portrait', 'square'));

ALTER TABLE "broadcast_destinations" DROP CONSTRAINT IF EXISTS "broadcast_destinations_framing_mode_check";
ALTER TABLE "broadcast_destinations"
  ADD CONSTRAINT "broadcast_destinations_framing_mode_check"
  CHECK ("framing_mode" IN ('fit', 'fill'));
