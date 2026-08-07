# CreatorOS — Design System (Exhaustive)

CreatorOS is a mobile-first creator/social platform (390 × 884 frames). Its visual language is a **premium, monochromatic dark theme** — pure black surfaces, white text, gray hierarchy — with a **single blue accent** for links, primary actions, and active states. One **light-theme variant** exists (Share Profile). Built with Tailwind + Inter.

---

## 1. Design Principles

- **Monochromatic first.** Black, near-black surfaces, and gray text carry the whole UI. Color signals meaning only (links, verified, active, primary actions).
- **Content forward.** Chrome (header, bottom nav) sits on pure black so media and posts dominate.
- **High contrast, low chrome.** Subtle 1px borders instead of heavy dividers; generous spacing.
- **Consistent field styling.** Inputs share a common black/elevated background and radius across screens.

---

## 2. Color Tokens

### Surfaces (dark theme — default)
| Token | Hex | Usage |
|-------|-----|-------|
| `surface/base` | `#000000` | App background, header, bottom nav |
| `surface/raised` | `#121212` | Cards, panels |
| `surface/raised-alt` | `#1e1f22` | Message bubbles, input fields |
| `surface/muted` | `#18181b` (zinc-900) | Secondary buttons, chips |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text/primary` | `#ffffff` | Headings, active labels, body |
| `text/secondary` | `#949ba4` | Body, metadata |
| `text/muted` | `#71767b` | Timestamps, inactive tabs, captions |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `border/subtle` | `#2f3336` (zinc-800) | Card borders, dividers, outlines |
| `border/contrast` | `#000000` | Avatar rings over media |

### Accent
| Token | Hex | Usage |
|-------|-----|-------|
| `accent/primary` | `#1d9bf0` | Links, primary CTAs, active tab indicator, verified badge |
| `accent/deep` | `#0a338d` | Accent gradients / pressed accent |

### Light theme (Share Profile variant)
White base surface, black primary text, gray secondary; same blue accent. Used for the shareable public profile.

---

## 3. Typography

**Family:** `'Inter', sans-serif`. Weights: predominantly **Bold (700)** for labels/headings, Regular for body/metadata.

| Token | Tailwind | Weight | Usage |
|-------|----------|--------|-------|
| `display` | `text-2xl` | bold | Profile name, screen titles (Notifications) |
| `title` | `text-xl` | bold | `#` channel glyph |
| `heading` | `text-base` | bold | Header title, actor names, channel names |
| `body` | `text-sm` | regular / bold | Post text, buttons, tabs, list items |
| `caption` | `text-xs` | regular | Timestamps, stat labels, trending post counts |

**Tracking:** `tracking-tight` for headings/channel names; `tracking-wider` for small uppercase labels.

---

## 4. Spacing (4px scale)

| Token | Value | Usage |
|-------|-------|-------|
| `space/1` | 4px | Icon+label, verified badge gap |
| `space/2` | 8px | Compact gaps |
| `space/3` | 12px | Default internal padding |
| `space/4` | 16px | Screen padding (`px-4 p-4`) |
| `space/5` | 20px | Header icon groups |
| `space/6` | 24px | Section separation |

**Layout frame:** `flex flex-col h-screen overflow-hidden`; header `h-14` sticky `top-0 z-50`; scroll region `overflow-y-auto` between header and bottom nav; frame 390 × 884.

---

## 5. Radius

| Token | Tailwind | Usage |
|-------|----------|-------|
| `radius/sm` | `rounded` | Chips, small controls |
| `radius/md` | `rounded-lg` | Buttons, cards, media |
| `radius/lg` | `rounded-xl` | Large media, bottom sheet top corners |
| `radius/full` | `rounded-full` | Avatars, pills, icon buttons, Follow button |

---

## 6. Core Components

### Navigation Header
`flex items-center justify-between px-4 h-14 bg-black sticky top-0 z-50`. Two patterns: (a) **brand header** — "CreatorOS" wordmark left, search + bell icons right; (b) **contextual header** — back arrow + title (e.g. "Notifications"), optional trailing action. Icons: `text-zinc-400 hover:text-white transition-colors`.

### Bottom Navigation
Fixed bar on `bg-black` with `border-t border-zinc-800`, 5 icons: home/compass, shop, add (+), chat, profile. Active = white/accent, inactive = `text-zinc-500`.

### Segmented Tabs (For You / Following)
Equal-width row `flex-1 text-sm font-bold py-3`. Active = `text-white` with accent underline indicator; inactive = `text-zinc-500`.

### Buttons
- **Secondary:** `bg-zinc-900 text-white font-bold rounded-lg border border-zinc-800 text-sm py-1.5`
- **Primary / Follow:** accent-filled pill, `bg-[#1d9bf0] text-white font-bold rounded-full px-4 py-1.5`
- **Follow (outline variant):** transparent bg + white text + subtle border, `rounded-full` (used on story viewer).
- **Icon button:** `rounded-full`, muted→white on hover.

### Avatars
`rounded-full`, sizes `w-10 h-10` (list/feed) up to `w-16 h-16` (profile). Story ring / `border-2 border-black` when over media. Notifications avatars carry a small colored **activity badge** overlay (like/comment/follow).

### Input Fields
Shared style: elevated black/`#1e1f22` background, `rounded-lg`, muted placeholder. Examples: message composer (`h-12 bg-transparent` inside raised container), search bar (`rounded-full` with leading search icon + trailing clear ✕), event form fields (consistent black background across name/date/time/location/channel/description).

---

## 7. Screen Inventory

### Feed / Explore
1. **Explore – For You Tab (Feed View)** — brand header, tabs (For You active), **story avatars row** (You with `+`, then creators: Elena, Marcus, Sophie, David), then **post cards**.
2. **Explore – Following Tab (Feed View)** — identical, "Following" active.

**Post card anatomy:** avatar + bold name + accent verified badge + `@handle` + `· timestamp` + `⋯` menu; body text; media image (`rounded-lg`, full width); **engagement row**: like (heart + count, e.g. 1.2k), comment (48), repost (12), views (687), share. Counts in `text-xs` muted.

### Full-screen Media / Reel
3. **Explore – Feed Media View** — full-bleed media; back + `⋯`; overlaid creator row (avatar, name, verified, `@handle`) + **Follow** pill; caption; engagement (heart 4K, comment 132, repost 107, share); **video controls**: play/pause, `0:12 / 0:37` timestamp, mute, fullscreen, PiP.

### Stories / Status Viewer
4. **Explore – Story Button View (Active)** — top segmented progress bar (implied); avatar + username + `19h` + **audio ticker** (track name + album thumbnail) + Follow (outline) + `⋯` + close ✕; full-bleed media (`rounded-xl`); `@handle` caption; **bottom bar**: pill "Send message…" + heart + comment + send (paper-plane) icons.

### Search
5. **Explore – Feed Search Button View** — search bar (back arrow + "Search creators, drops, or tags" + clear ✕); **Recent Searches** with "Clear all" (rows = avatar + name + remove ✕); **Trending Topics** (rows = category label · "Trending" + bold tag e.g. `web3`, `digitalart`, `creators`, `passiveincome` + post/creator count).

### Notifications
6. **Explore – Feed Notifications** — "Notifications" title + back arrow; rows = avatar (w/ activity badge) + **bold actor** + regular action ("liked your post", "mentioned you in a comment", "started following you", "shared your latest project") + muted timestamp below.

### Sharing
7. **Share Profile – Light Theme** — light-theme feed with a **bottom-sheet "Share to…" modal**: grabber handle, rounded top corners, dimmed backdrop; row of circular icon buttons w/ labels (Messages, WhatsApp, Instagram, X); list actions each w/ leading circular icon (Copy Link, Send in DM, Share to…).

### Profile
8. **Profile (Sarah Jenkins)** — header; profile block with avatar, name, **stats shown as number stacked above label** (monochromatic style); action buttons (secondary style); **profile tabs**; feed; bottom nav.
   - Per an in-app note, profile has multiple tab views: **Reposts, Likes, Tagged, Offers, Playlists, and Public view** — same layout, different content/active tab. *(Existence confirmed via app note; individual layouts not separately re-inspected due to app freeze.)*

### Community / Chat
9. **Community Chat (channel)** — header: back arrow + `#` glyph + channel name (e.g. `clips-and-highlights`) + search/action icons; scrollable **message list** (avatar `w-10 h-10`, bold author, `text-xs` muted timestamp, message body `text-sm`); **message input** bar (raised container, `h-12`, leading/trailing icon actions).

### Events
10. **Event Creation Page** — form with fields for **event name, date, time, location, channel, description**, all sharing the consistent black field background. *(Confirmed via app note + visible label; full field-by-field layout not re-inspected due to app freeze.)*

### State Variants (button/interaction states)
The canvas contained duplicate rows demonstrating interaction states of the Explore screens — e.g. **Story Button Active**, **Search Button View**, **Notifications Button** variants, and a generic **"Generated Screen"** placeholder. These reuse the components above with the relevant control in its active/pressed state.

---

## 8. States & Interaction

- **Hover:** icons muted→white (`hover:text-white transition-colors`); buttons `hover:opacity-70`.
- **Active/Selected:** white text + accent underline (tabs), accent fill (primary/Follow), bold weight.
- **Verified:** accent-blue badge beside name.
- **Transitions:** consistent `transition-colors` / `transition-opacity`.

---

## 9. Tailwind Config Reference

```js
theme: {
  extend: {
    colors: {
      base:        '#000000',
      raised:      '#121212',
      'raised-alt':'#1e1f22',
      border:      '#2f3336',
      'text-secondary': '#949ba4',
      'text-muted':     '#71767b',
      accent:      '#1d9bf0',
      'accent-deep':'#0a338d',
    },
    fontFamily: { sans: ['Inter', 'sans-serif'] },
    borderRadius: { DEFAULT:'0.25rem', lg:'0.5rem', xl:'0.75rem', full:'9999px' },
  }
}
```