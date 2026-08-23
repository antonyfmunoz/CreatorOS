import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const stitchRoot = path.resolve(
  "attached_assets",
  "stitch_creatoros",
  "stitch_creatoros",
);

const cases = [
  { route: "/", reference: "explore_compact_stories_row_10" },
  { route: "/marketplace", reference: "marketplace_corrected_add_icon", invertReference: true },
  { route: "/messages", reference: "messages_corrected_polished_view" },
  { route: "/profile", reference: "profile_feed_actions_aligned" },
  { route: "/notifications", reference: "notifications_matched_header_height" },
  { route: "/settings", reference: "settings_notifications_toggle_added" },
] as const;

type Signature = {
  luminance: number;
  darkRatio: number;
  lightRatio: number;
  blueAccentRatio: number;
  edgeDensity: number;
  colorfulness: number;
  pixels: Buffer;
};

async function signature(image: Buffer | string, invert = false): Promise<Signature> {
  let pipeline = sharp(image)
    .resize(64, 128, { fit: "fill" })
    .removeAlpha();
  if (invert) pipeline = pipeline.negate({ alpha: false });
  const { data, info } = await pipeline
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminanceValues = new Float64Array(info.width * info.height);
  let luminance = 0;
  let dark = 0;
  let light = 0;
  let blue = 0;
  let colorfulness = 0;
  for (let pixel = 0; pixel < luminanceValues.length; pixel += 1) {
    const offset = pixel * 3;
    const red = data[offset];
    const green = data[offset + 1];
    const blueChannel = data[offset + 2];
    const value = red * 0.2126 + green * 0.7152 + blueChannel * 0.0722;
    luminanceValues[pixel] = value;
    luminance += value;
    if (value < 40) dark += 1;
    if (value > 210) light += 1;
    if (blueChannel > 80 && blueChannel > red * 1.2 && blueChannel > green * 1.05) blue += 1;
    colorfulness += Math.max(red, green, blueChannel) - Math.min(red, green, blueChannel);
  }
  let edges = 0;
  let edgeCount = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      if (x + 1 < info.width) {
        edges += Math.abs(luminanceValues[index] - luminanceValues[index + 1]);
        edgeCount += 1;
      }
      if (y + 1 < info.height) {
        edges += Math.abs(luminanceValues[index] - luminanceValues[index + info.width]);
        edgeCount += 1;
      }
    }
  }
  const count = luminanceValues.length;
  return {
    luminance: luminance / count,
    darkRatio: dark / count,
    lightRatio: light / count,
    blueAccentRatio: blue / count,
    edgeDensity: edges / edgeCount / 255,
    colorfulness: colorfulness / count / 255,
    pixels: data,
  };
}

function meanAbsolutePixelDifference(left: Buffer, right: Buffer) {
  expect(left.length).toBe(right.length);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += Math.abs(left[index] - right[index]);
  }
  return difference / left.length / 255;
}

async function waitForCanonicalSurface(page: Page, route: string) {
  if (route === "/") {
    await expect(page.getByRole("button", { name: "Following", exact: true })).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
  } else if (route === "/marketplace") {
    await expect(page.getByRole("searchbox", { name: "Search marketplace" })).toBeVisible();
    await expect(page.getByText("Loading marketplace…", { exact: true })).toHaveCount(0);
  } else if (route === "/messages") {
    await page.getByRole("button", { name: /Start (or manage )?native chat/i }).click();
    await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  } else if (route === "/profile") {
    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
  } else if (route === "/notifications") {
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  } else if (route === "/settings") {
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Stitch source screens use the mobile portrait canvas");
  const response = await page.request.patch("/api/user/settings", { data: { colorMode: "dark" } });
  expect(response.ok()).toBeTruthy();
});

for (const visualCase of cases) {
  test(`Stitch visual signature remains aligned for ${visualCase.route}`, async ({ page }, testInfo) => {
    await page.goto(visualCase.route);
    await expect(page.locator("#main-content")).toBeVisible();
    await waitForCanonicalSurface(page, visualCase.route);
    await page.addStyleTag({
      content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}body>div.fixed.top-4.right-4.z-50{display:none!important}",
    });
    await page.evaluate(() => document.fonts.ready);
    const candidate = await page.screenshot({ animations: "disabled", scale: "css" });
    const referencePath = path.join(stitchRoot, visualCase.reference, "screen.png");
    const [candidateSignature, referenceSignature] = await Promise.all([
      signature(candidate),
      signature(referencePath, "invertReference" in visualCase && visualCase.invertReference),
    ]);
    const comparison = {
      route: visualCase.route,
      reference: visualCase.reference,
      normalizedMeanAbsolutePixelDifference: meanAbsolutePixelDifference(
        candidateSignature.pixels,
        referenceSignature.pixels,
      ),
      luminanceDifference: Math.abs(candidateSignature.luminance - referenceSignature.luminance),
      darkRatioDifference: Math.abs(candidateSignature.darkRatio - referenceSignature.darkRatio),
      lightRatioDifference: Math.abs(candidateSignature.lightRatio - referenceSignature.lightRatio),
      blueAccentRatioDifference: Math.abs(
        candidateSignature.blueAccentRatio - referenceSignature.blueAccentRatio,
      ),
      edgeDensityDifference: Math.abs(candidateSignature.edgeDensity - referenceSignature.edgeDensity),
      colorfulnessDifference: Math.abs(candidateSignature.colorfulness - referenceSignature.colorfulness),
    };
    await testInfo.attach("stitch-visual-signature.json", {
      body: JSON.stringify(comparison, null, 2),
      contentType: "application/json",
    });

    // These thresholds protect the selected Stitch design language (black
    // canvas, white hierarchy, restrained brand-blue accents, and compact
    // edge density) while allowing seeded text and media to vary.
    expect(comparison.normalizedMeanAbsolutePixelDifference).toBeLessThan(0.48);
    expect(comparison.luminanceDifference).toBeLessThan(65);
    expect(comparison.darkRatioDifference).toBeLessThan(0.4);
    expect(comparison.lightRatioDifference).toBeLessThan(0.25);
    expect(comparison.blueAccentRatioDifference).toBeLessThan(0.2);
    expect(comparison.edgeDensityDifference).toBeLessThan(0.2);
    expect(comparison.colorfulnessDifference).toBeLessThan(0.25);
  });
}
