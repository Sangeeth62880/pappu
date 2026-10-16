# Assets Specification

This specification documents the icon family, every icon used across screens, mascot poses, app icon and splash requirements, and assets that must be supplied by the user.

## 1. Icon Family

- Family: Lucide / Feather Icons
- Style: Rounded outline
- Standard ViewBox: `0 0 24 24`
- Stroke Width: `2px`
- Stroke Linecap: `round`
- Stroke Linejoin: `round`
- Color: Inherits token (typically `ink` `#1F2937`, or `ink_muted` `#6B7280`, or semantic color)

### Icon Mapping by Screen

| Icon Name | Symbol Key | Stitch Code ViewBox / Path | Used In Screen(s) | Role |
|:---|:---|:---|:---|:---|
| `home` | Home Tab | `viewBox="0 0 24 24"` | Home, History, People, Me | Tab bar item 1 |
| `clock` | History Tab | `viewBox="0 0 24 24"` | Home, History, People, Me | Tab bar item 2 |
| `users` | People Tab | `viewBox="0 0 24 24"` | Home, History, People, Me | Tab bar item 4 |
| `user` | Me Tab | `viewBox="0 0 24 24"` | Home, History, People, Me, Sign In | Tab bar item 5, Name input |
| `search` | Search | `viewBox="0 0 24 24"` | History, People | Header search button (History), input prefix (People) |
| `plus` | Plus | `viewBox="0 0 24 24"` | People | Header right add person button (40px gold circle) |
| `x` | Close / Dismiss | `viewBox="0 0 24 24"` | Assistant, Edit Transaction | Header close modal / sheet trigger |
| `arrow_left` | Back Navigation | `viewBox="0 0 24 24"` | Person Detail (Pooja) | Header back button |
| `trash_2` | Delete / Trash | `viewBox="0 0 24 24"` | History, Edit Transaction, Delete Dialog | Swipe action reveal, sheet delete button, dialog icon |
| `mic` | Microphone | `viewBox="0 0 24 24"` | Assistant | Center coin entry, input bar audio action |
| `volume_2` | Audio Speaker | `viewBox="0 0 24 24"` | Assistant | Audio replay trigger at trailing end of Pappu speech |
| `mail` | Email | `viewBox="0 0 24 24"` | Sign In, Create Account | Email input leading icon |
| `lock` | Lock | `viewBox="0 0 24 24"` | Sign In, Create Account | Password input leading icon |
| `eye` / `eye_off` | Visibility | `viewBox="0 0 24 24"` | Sign In, Create Account | Password visibility toggle |
| `message_square` | Chat Bubble | `viewBox="0 0 24 24"` | Me | Clear chat history settings row leading icon |
| `share_2` | Share | `viewBox="0 0 24 24"` | Person Detail (Pooja) | Remind action button |
| `coffee` | Food Category | `viewBox="0 0 24 24"` | Home, History, Edit Transaction | Food & Dining category avatar |
| `shopping_bag` | Shopping Category | `viewBox="0 0 24 24"` | Home, History, Edit Transaction | Shopping category avatar |
| `truck` | Transport Category | `viewBox="0 0 24 24"` | Home, History, Edit Transaction | Transport category avatar |
| `tag` | Other Category | `viewBox="0 0 24 24"` | Home, History, Edit Transaction | Other category avatar |
| `chevron_right` | Chevron Right | `viewBox="0 0 24 24"` | Me | Settings list row navigation disclosure |
| `check` | Checkmark | `viewBox="0 0 24 24"` | Dialogs, Chips | Selection indicator |

## 2. Mascot Character (Pappu)

Pappu is a 2D gold coin character with noodle arms, short legs, an embossed ₹ symbol on the torso, and expressive eyes and mouth.

### Available Poses (Character Reference Sheet)

The character reference sheet defines 10 distinct emotional and state poses:

1. `Idle`: Relaxed stance, eyes forward, tiny smile. Default system state.
2. `Listening`: Hand raised to ear, attentive tilt. Used when audio input capture is active.
3. `Thinking`: Hand on chin, looking upward. Used while backend parses query.
4. `Speaking`: Open mouth, gesturing hand. Used during audio playback / TTS streaming.
5. `Happy`: Both hands raised, curved eye arcs, wide smile. Used on successful expense logging.
6. `Excited`: Jump posture, star-bright expression. Used on income logging and celebrations.
7. `Worried`: Wavy mouth, nervous brow. Used when spending increases over threshold.
8. `Concerned`: Hand on chest, questioning brow. Used for destructive confirmation requests.
9. `Confused`: Tilted coin head, question mark above, squinting eyes. Used on unclear audio.
10. `Sleepy`: Drooping posture, closed eye arcs, hanging arms. Used after 60 seconds of inactivity.

### Canonical Sizes Across App

| Size | Application in Screens |
|:---|:---|
| 32px | Header coin mark (top left "P" coin on all tab screens) |
| 48px | Home greeting row avatar, Me screen profile card avatar |
| 72px | Bottom tab bar raised center entry coin |
| 120px | Assistant sheet hero header mascot, History empty state mascot |
| 180px | Sign In and Create Account hero mascot |

## 3. App Icon and Splash Requirements

1. Production App Icon:
   - Size: 1024x1024 px PNG
   - Visual: Gold coin mascot (Idle or Waving pose) centered on flat `#FFF8E7` background with no gradient or outer border
2. Android Adaptive Icon:
   - Foreground: 432x432 px PNG (mascot centered within safe area)
   - Background: Flat `#FFF8E7` solid color
   - Monochrome: Flat black vector silhouette of Pappu coin
3. Splash Screen:
   - Logo: 200x200 px PNG / SVG of Pappu coin centered
   - Background Color: `#FFF8E7`
   - Dark Mode Variant: None (app is light mode only)

## 4. Missing Assets to be Supplied by User

The repository currently lacks standalone image and vector asset files in `assets/pappu/`. The user must supply:

1. Individual Pose SVG / PNG files in `assets/pappu/`:
   - `mascot_idle.png` (or `.svg`)
   - `mascot_listening.png`
   - `mascot_thinking.png`
   - `mascot_speaking.png`
   - `mascot_happy.png`
   - `mascot_excited.png`
   - `mascot_worried.png`
   - `mascot_concerned.png`
   - `mascot_confused.png`
   - `mascot_sleepy.png`
2. App Icon high resolution master file:
   - `assets/pappu/app_icon_1024.png`
3. Splash Screen asset:
   - `assets/pappu/splash_logo.png`
