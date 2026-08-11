# Stitch-only visual parity register

This register uses only the authoritative screenshots under
`attached_assets/stitch_creatoros/stitch_creatoros/*/screen.png`. No image in
the older flat `attached_assets` collection is a design reference. Each Stitch
folder below is paired to a product route, an implemented state, or an explicit
superseding decision. Iterative screenshots are treated as state refinements,
not as separate routes.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `implemented` | The corresponding route and interaction exist in the product. |
| `qualifying` | The route exists, but exact interaction or cross-viewport proof is still running. |
| `superseded` | A later Stitch state or an explicit product decision replaces this visual variant. |
| `provider_pending` | The native shell exists; live media/provider behavior needs external activation. |

## Screen register

| Stitch screenshots | Canonical route/state | Status | Parity decision or remaining proof |
| --- | --- | --- | --- |
| `community_chat_context_menu_cleaned`; `community_chat_large_header_text`; `community_refined_sidebar` | `/communities/:id`, joined member, selected text channel | `implemented` | Dark channel rail, selected channel, composer and message context actions pass the joined-member desktop/mobile browser journey. Owner/moderator authorization is tracked in the broader role matrix rather than as a separate Stitch state. |
| `community_search_recent_messages_view`; `community_search_refined_labels`; `community_search_selection_view`; `community_search_white_ring_highlights` | `/communities/:id`, community search overlay | `implemented` | Recent state, query results, selected white ring and jump-to-message behavior pass on both qualified viewports. |
| `community_detail_light_theme_view` | `/communities/:id` pre-join gate | `superseded` | The access gate and preview semantics remain; the light palette is superseded by the later dark community states and the product-wide dark design decision. |
| `create_event_pure_black_theme` | `/create/event`, `/events/:id/edit` | `implemented` | Pure-black form, validation, date/time, room/link and create/edit paths are present; covered in route qualification. |
| `direct_message_alex_rivera`; `direct_message_suggested_refined` | `/messages`, native chat mode and unified inbox | `qualifying` | Native direct messaging, suggestions, search and canonical Relationship Hub synchronization exist. Re-run create/send/reload and suggested-contact selection. |
| `edit_bio_refined_button`; `edit_links_refined_button`; `edit_name_stacked_layout`; `edit_profile_refined_header` | `/profile`, Edit profile full-screen sheet | `implemented` | Name, username, bio, avatar and up-to-five validated public links are editable. Public links pass desktop/mobile mutation-and-reload proof; non-owner authorization remains part of the broader role matrix. |
| `explore_compact_light_theme_mirrored_1`; `explore_compact_light_theme_mirrored_2` | `/`, Explore feed | `superseded` | Feed hierarchy informs the current build; the light palette is superseded by the later dark Stitch states and selected application theme. |
| `explore_compact_stories_row_1`; `explore_compact_stories_row_2`; `explore_compact_stories_row_3`; `explore_compact_stories_row_4`; `explore_compact_stories_row_5`; `explore_compact_stories_row_6`; `explore_compact_stories_row_7`; `explore_compact_stories_row_8`; `explore_compact_stories_row_9`; `explore_compact_stories_row_10`; `explore_compact_stories_row_11`; `explore_compact_stories_row_12`; `explore_compact_stories_row_13`; `explore_compact_stories_row_14`; `explore_compact_stories_row_15`; `explore_compact_stories_row_16`; `explore_compact_stories_row_17` | `/`, story rail, create/view/reply states | `qualifying` | Hidden-scrollbar touch/pointer/keyboard rail, current-user create affordance, viewer and story mutations exist. Media upload and persistence field proof remains. |
| `explore_following_active_final_1`; `explore_following_active_final_2` | `/`, Following feed filter | `qualifying` | Selected-state styling and following query exist; verify empty/follow/mutation/refresh transition. |
| `generated_screen_1`; `generated_screen_2`; `generated_screen_3`; `generated_screen_4` | `/`, `/marketplace/product/:id`, `/cart`, `/messages` | `qualifying` | These composite generation states map to the implemented dark feed, offer detail/cart and group-chat flows. Each canonical route is tested independently instead of preserving generation artifacts as routes. |
| `invite_friends_monochromatic_search_bar` | `/messages`, native/group chat invite flow | `qualifying` | Creator search and group participant selection exist; verify result selection, removal and empty state. |
| `marketplace_corrected_add_icon`; `marketplace_corrected_navigation` | `/marketplace`, selected category and add/save/cart actions | `implemented` | Corrected route navigation, community category selection, search match and empty-filter state pass desktop/mobile qualification. Account-backed cart/save ownership remains in the broader commerce matrix. |
| `messages_bold_recent_header`; `messages_corrected_polished_view`; `messages_group_name_input_added`; `messages_sophie_profile_fixed`; `messages_streamlined_view_1`; `messages_streamlined_view_2` | `/messages`, native chat selector and group creation | `qualifying` | Recent/suggested people, creator identity, group name and direct/group creation exist behind the native-chat control. Mutation/reload and responsive proof remains. |
| `notifications_brand_aligned_header_1`; `notifications_brand_aligned_header_2`; `notifications_brand_aligned_header_3`; `notifications_brand_aligned_header_4`; `notifications_matched_header_height` | `/notifications` | `qualifying` | The dark brand-aligned header is canonical; activity rows, unread/read and empty/loading states exist. Verify mark-one/mark-all persistence. Light iterations are superseded by the later dark state. |
| `profile_concise_offer_brands`; `profile_feed_actions_aligned`; `profile_likes_tab_selected`; `profile_repost_selected_state_fix`; `profile_stats_refined_likes`; `profile_stats_refined_offers`; `profile_stats_refined_playlists`; `profile_stats_refined_reposts`; `profile_tagged_tab_blue_mentions`; `profile_tagged_tab_selected`; `profile_youtube_style_playlists` | `/profile`, six horizontally navigable tabs | `qualifying` | Posts, Reposts, Likes, Tagged, Offers and Playlists exist with selected states, mention navigation and feed actions. Click-after-slide coverage passes; full owner/non-owner content proof remains. |
| `profile_stats_refined_public` | `/profile` | `superseded` | The screenshot informs public-profile presentation, but `Public` is not a visible tab. The explicit final decision is six tabs only: Posts, Reposts, Likes, Tagged, Offers and Playlists. |
| `search_no_navbar_1`; `search_no_navbar_2`; `search_no_navbar_3`; `search_no_navbar_4` | `/search` | `implemented` | Search is a focused surface with no bottom navigation. Recent searches, clear/dismiss, creator, offer, product and topic states are implemented in the selected dark palette; light variants are superseded. |
| `settings_notifications_toggle_added` | `/settings` | `implemented` | General settings, durable notification preference and high-contrast appearance selection pass desktop/mobile mutation-and-reload qualification; privacy remains available at `/settings/privacy`. |
| `share_profile_light_theme`; `share_profile_refined_header_typography` | `/profile`, Share profile bottom sheet | `implemented` | The refined dark sheet is canonical and includes message, WhatsApp, Instagram, X, copy-link, native DM and system share behavior. The earlier light variant is superseded. |
| `voice_lobby_compact_header` | `/communities/:communityId/rooms/:roomId` | `provider_pending` | Compact consent-first room lobby and provider-disabled state exist. Live camera/audio, recording, transcription and role-scoped AI require the configured realtime providers. |

## Current closure sequence

1. Complete owner, non-owner, member, moderator, buyer and learner browser
   journeys for every `qualifying` row.
2. Capture mobile and desktop screenshots from the same browser journeys and
   compare hierarchy, spacing, selected states, overflow and dialog behavior.
3. Keep provider-gated media behavior visibly disabled until its independent
   live round trip passes.

The register contains all 74 authoritative Stitch folders exactly once.
