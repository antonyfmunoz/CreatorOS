import assert from "node:assert/strict";
import test from "node:test";
import { compactConfig, resolveFlyConfig, scaledConfig } from "./resolve-live-fly-config.mjs";

const machine = (group) => ({ config: { metadata: { fly_process_group: group } } });

test("preserves the compact and scaled live topology", () => {
  assert.equal(resolveFlyConfig([machine("app"), machine("app")]), compactConfig);
  assert.equal(resolveFlyConfig([machine("web"), machine("media"), machine("cut")]), scaledConfig);
  assert.equal(resolveFlyConfig([machine("web")]), scaledConfig);
});

test("fails closed for absent, mixed, and unknown process groups", () => {
  assert.throws(() => resolveFlyConfig([]), /ambiguous.*none/);
  assert.throws(() => resolveFlyConfig([machine("app"), machine("web")]), /ambiguous.*app,web/);
  assert.throws(() => resolveFlyConfig([machine("mystery")]), /ambiguous.*mystery/);
});

test("requires an exact explicit confirmation for topology transitions", () => {
  const compact = [machine("app")];
  assert.throws(
    () => resolveFlyConfig(compact, { override: scaledConfig }),
    /APPLY_SCALED_TOPOLOGY/,
  );
  assert.equal(
    resolveFlyConfig(compact, { override: scaledConfig, confirmation: "APPLY_SCALED_TOPOLOGY" }),
    scaledConfig,
  );
  assert.equal(
    resolveFlyConfig([machine("web")], { override: compactConfig, confirmation: "APPLY_COMPACT_TOPOLOGY" }),
    compactConfig,
  );
  assert.throws(
    () => resolveFlyConfig(compact, { override: "other.toml", confirmation: "anything" }),
    /Unsupported/,
  );
  assert.throws(
    () => resolveFlyConfig([machine("app"), machine("mystery")], {
      override: scaledConfig,
      confirmation: "APPLY_SCALED_TOPOLOGY",
    }),
    /ambiguous/,
  );
});
