import { describe, expect, it } from 'vitest';
import { motionTemplate } from '../client/src/lib/cut-motion-templates';
import { cutCompositionManifestSchema } from '../shared/cut-studio-production';

describe('motion starter layer-relative timing', () => {
  for (const template of ['kinetic', 'lower_third', 'product'] as const) {
    it(`${template} stays valid on short, normal and long compositions`, () => {
      for (const duration of [.1, .5, 1, 1.01, 1.5, 5, 8, 60]) {
        for (const mediaKind of ['video', 'audio'] as const) {
          const manifest = motionTemplate({ sourceAssetId: '00000000-0000-4000-8000-000000000001', name: 'Timing fixture', duration, mediaKind }, template);
          expect(cutCompositionManifestSchema.safeParse(manifest).success).toBe(true);
          const graphic = manifest.layers[1];
          expect(graphic.from + graphic.durationInFrames).toBeLessThanOrEqual(manifest.durationInFrames);
          expect(graphic.enter!.durationInFrames).toBeLessThanOrEqual(graphic.durationInFrames);
          expect(graphic.exit!.durationInFrames).toBeLessThanOrEqual(graphic.durationInFrames);
          for (const animation of graphic.animations) {
            for (const keyframe of animation.keyframes) expect(keyframe.frame).toBeLessThan(graphic.durationInFrames);
          }
        }
      }
    });
  }
});
