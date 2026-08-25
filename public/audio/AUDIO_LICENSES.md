# Options Tycoon Audio Provenance & Licensing Documentation

All audio assets included in Options Tycoon follow institutional open licensing and CC0 / Public Domain / Procedural Synthesis guidelines.

## 1. 4-Channel Audio Architecture
The audio engine (`frontend/src/lib/audio.ts`) provides independent channel management:
- **Master Bus**: Global volume control (0..1) with global mute.
- **Music (BGM) Bus**: 12 thematic dynamic tracks with automatic crossfading and looping.
- **Ambience Bus**: Background audio textures with automatic dynamic ducking during speech/news alerts.
- **SFX Bus**: Action feedback effects for clicks, orders, compliance warnings, and margin calls.

## 2. BGM Tracks (Procedural Studio Synthesis)
License: **Creative Commons Zero (CC0 1.0 Universal) / Custom Procedural Audio**
- `main_menu_theme.wav` — Main Title & New Game Theme (Ambient Synthwave)
- `war_room_tactics.wav` — Daily PM War Room & Briefing Theme (Cinematic Pad)
- `trading_floor_active.wav` — Market Open & Active Execution (120 BPM Pulse)
- `market_pulse_heat.wav` — Retail Narrative & Social Sentiment Feed (115 BPM Electronic)
- `policy_corridor_dc.wav` — Washington DC & Capitol Hill Desk (Ambient Drone)
- `wall_street_desk_deal.wav` — Prime Brokerage & Investment Bank Desk (105 BPM Corporate Synth)
- `crisis_night_deepseek.wav` — DeepSeek R1 Shock & Volatility Spike (Dark Sub-Bass Tension)
- `sec_investigation_tension.wav` — Compliance Inquiries & Marcus Reed Scrutiny (Suspense Pad)
- `adrian_cross_rivalry.wav` — Apex Horizon Warfare & Short Attack (128 BPM High-Energy Rivalry)
- `post_mortem_360_review.wav` — 360° Trade Review & Analytical Post-Mortem (Reflective Ambient)
- `victory_next_king.wav` — Season Finale Victory: The Next King (Uplifting Cinematic)
- `defeat_redemption_spiral.wav` — Crisis Spiral & Survival Defeat (Melancholic Drone)

## 3. Ambience Tracks
License: **Public Domain / CC0 Audio Textures**
- `terminal_night_20s.wav` — Late Night Bloomberg Terminal humming & quiet cooling fans
- `market_open_14s.wav` — Opening bell buzz & exchange trading floor background murmur
- `crisis_pulse_16s.wav` — Low frequency heartbeat pulse for critical drawdown regimes
- `office_ambience.wav` — Daylight trading floor keyboard clatter & background chatter

## 4. Sound Effects (SFX)
License: **Public Domain / CC0 Sound Packs**
- `ui_click.wav`, `ui_hover.wav`, `order_fill.wav`, `order_reject.wav`, `breaking_news.wav`, `message_private.wav`, `compliance_warning.wav`, `margin_call.wav`, `trading_halt.wav`, `pnl_gain.wav`, `pnl_loss.wav`, `save.wav`, `load.wav`.
