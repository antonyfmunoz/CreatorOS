import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const stitchRoot = path.resolve(
  "attached_assets",
  "stitch_creatoros",
  "stitch_creatoros",
);

type VisualCase = {
  label: string;
  route: string;
  reference: string;
  invertReference?: boolean;
  blueAccentLimit?: number;
  colorfulnessLimit?: number;
  beforeNavigate?: (page: Page) => Promise<void>;
  prepare?: (page: Page) => Promise<void>;
};

const openNativeMessages = async (page: Page) => {
  await page.getByRole("button", { name: "Start or manage native chats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
};

const openJoinedCommunity = async (page: Page) => {
  const join = page.getByRole("button", { name: "Join community" });
  const composer = page.getByPlaceholder(/Message #general/);
  await expect(join.or(composer)).toBeVisible();
  if (await join.isVisible()) {
    const response = page.waitForResponse((item) => item.url().endsWith("/api/communities/1/join") && item.request().method() === "POST");
    await join.click();
    expect((await response).ok()).toBeTruthy();
  }
  await expect(composer).toBeEnabled();
};

const cases: VisualCase[] = [
  { label: "Explore feed", route: "/", reference: "explore_compact_stories_row_10" },
  {
    label: "Story composer",
    route: "/",
    reference: "explore_compact_stories_row_12",
    beforeNavigate: async (page) => {
      const stories = await page.request.get("/api/users/1/stories");
      expect(stories.ok()).toBeTruthy();
      for (const story of (await stories.json()) as Array<{ id: number }>) {
        expect((await page.request.delete(`/api/stories/${story.id}`)).ok()).toBeTruthy();
      }
    },
    prepare: async (page) => {
      await page.getByRole("button", { name: "Create a story" }).click();
      await expect(page.getByRole("heading", { name: "Add to Your Story" })).toBeVisible();
    },
  },
  {
    label: "Story viewer follow state",
    route: "/",
    reference: "explore_following_active_final_1",
    // The seeded story artwork is intentionally tenant content, while the
    // Stitch frame contains unrelated green/orange artwork. Keep geometry,
    // luminance, density and total pixel-distance checks strict without
    // treating user media hue as application chrome.
    blueAccentLimit: 0.6,
    colorfulnessLimit: 0.35,
    prepare: async (page) => {
      await page.getByRole("button", { name: "View Sarah Mitchell's story" }).click();
      await expect(page.getByRole("button", { name: "Close story" })).toBeVisible();
    },
  },
  { label: "Marketplace", route: "/marketplace", reference: "marketplace_corrected_add_icon", invertReference: true },
  { label: "Marketplace product", route: "/marketplace/product/1", reference: "generated_screen_2" },
  { label: "Cart", route: "/cart", reference: "generated_screen_3" },
  { label: "Native messages", route: "/messages", reference: "messages_corrected_polished_view", prepare: openNativeMessages },
  {
    label: "Create group chat",
    route: "/messages",
    reference: "messages_group_name_input_added",
    prepare: async (page) => {
      await openNativeMessages(page);
      await page.getByRole("button", { name: "Create group chat" }).click();
      await expect(page.getByRole("heading", { name: "Create group chat" })).toBeVisible();
    },
  },
  { label: "Profile posts", route: "/profile", reference: "profile_feed_actions_aligned" },
  {
    label: "Edit profile",
    route: "/profile",
    reference: "edit_profile_refined_header",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Edit profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Edit Profile" })).toBeVisible();
    },
  },
  {
    label: "Share profile",
    route: "/profile",
    reference: "share_profile_refined_header_typography",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Share profile", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Share to…" })).toBeVisible();
    },
  },
  ...([
    ["Reposts", "profile_repost_selected_state_fix"],
    ["Likes", "profile_likes_tab_selected"],
    ["Tagged", "profile_tagged_tab_selected"],
    ["Offers", "profile_stats_refined_offers"],
    ["Playlists", "profile_youtube_style_playlists"],
  ] as const).map(([tab, reference]) => ({
    label: `Profile ${tab.toLowerCase()} tab`,
    route: "/profile",
    reference,
    prepare: async (page: Page) => {
      const control = page.getByRole("button", { name: tab, exact: true });
      await control.click();
      await expect(control).toHaveAttribute("aria-current", "page");
    },
  })),
  { label: "Notifications", route: "/notifications", reference: "notifications_matched_header_height" },
  { label: "Settings", route: "/settings", reference: "settings_notifications_toggle_added" },
  { label: "Search discovery", route: "/search", reference: "search_no_navbar_1" },
  { label: "Create event", route: "/create/event", reference: "create_event_pure_black_theme" },
  {
    label: "Joined community",
    route: "/communities/1",
    reference: "community_refined_sidebar",
    prepare: openJoinedCommunity,
  },
  {
    label: "Community search recent",
    route: "/communities/1",
    reference: "community_search_recent_messages_view",
    prepare: async (page) => {
      await openJoinedCommunity(page);
      await page.getByRole("button", { name: "Search community" }).click();
      await expect(page.getByText("Recent messages", { exact: true })).toBeVisible();
    },
  },
  {
    label: "Community search selection",
    route: "/communities/1",
    reference: "community_search_selection_view",
    prepare: async (page) => {
      await openJoinedCommunity(page);
      await page.getByRole("button", { name: "Search community" }).click();
      await page.getByRole("textbox", { name: "Search this channel" }).fill("virtual hackathon");
      const result = page.getByRole("button", { name: /virtual hackathon/i });
      await result.click();
      await expect(result).toHaveAttribute("aria-pressed", "true");
    },
  },
  {
    label: "Community message context menu",
    route: "/communities/1",
    reference: "community_chat_context_menu_cleaned",
    prepare: async (page) => {
      await openJoinedCommunity(page);
      await page.locator('[id^="community-message-"]').first().click({ button: "right" });
      await expect(page.getByRole("menuitem", { name: "Like" })).toBeVisible();
    },
  },
];

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
    await expect(page.getByRole("button", { name: "Start or manage native chats", exact: true })).toBeVisible();
  } else if (route === "/profile") {
    await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
  } else if (route === "/notifications") {
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  } else if (route === "/settings") {
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  } else if (route === "/search") {
    await expect(page.getByRole("searchbox", { name: "Search creators, offers, or tags" })).toBeVisible();
  } else if (route === "/create/event") {
    await expect(page.getByRole("heading", { name: "Create Event" })).toBeVisible();
  } else if (route === "/cart") {
    await expect(page.getByRole("heading", { name: "Your cart" }).first()).toBeVisible();
  } else if (route.startsWith("/marketplace/product/")) {
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Stitch source screens use the mobile portrait canvas");
  const response = await page.request.patch("/api/user/settings", { data: { colorMode: "dark" } });
  expect(response.ok()).toBeTruthy();
});

for (const visualCase of cases) {
  test(`Stitch visual signature remains aligned for ${visualCase.label}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await visualCase.beforeNavigate?.(page);
    await page.goto(visualCase.route);
    await expect(page.locator("#main-content")).toBeVisible();
    await waitForCanonicalSurface(page, visualCase.route);
    await visualCase.prepare?.(page);
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
      state: visualCase.label,
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
    expect(comparison.blueAccentRatioDifference).toBeLessThan(visualCase.blueAccentLimit ?? 0.2);
    expect(comparison.edgeDensityDifference).toBeLessThan(0.2);
    expect(comparison.colorfulnessDifference).toBeLessThan(visualCase.colorfulnessLimit ?? 0.25);
  });
}
