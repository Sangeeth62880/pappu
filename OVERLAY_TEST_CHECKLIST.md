# Voice Overlay Test Checklist (real phone)

Manual run of the Siri-style voice overlay on a physical phone, built from `feature/voice-overlay`
(`cd frontend && npx eas-cli build --platform android --profile preview`). Write Pass / Fail and a
note for every row. States can also be eyeballed without the backend in the dev styleguide
(section 12, `?styleguide` on web or `initialShowStyleguide`).

**Device:** ________ **OS:** ____ **Build:** ________ **Date:** ________ **Tester:** ________

## 0. Setup
- [ ] Backend awake (`/health` ok). Signed in with a test account. Volume up, not silent.
- [ ] Open Pappu once after install (registers the icon quick action).

## 1. Triggers
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 1.1 | Force close. `adb shell am start -a android.intent.action.VIEW -d "pappu://listen"` (iOS: Talk to Pappu shortcut). | After startup, Pappu rises from the bottom with a springy overshoot over Home, cue plays, "Listening…". | |
| 1.2 | App open on History, send the link again. | Overlay over History (History visible, dimmed), no navigation. | |
| 1.3 | App backgrounded, link again. | App returns, overlay summons. | |
| 1.4 | Long press the app icon > Talk to Pappu. | Same as 1.1. | |
| 1.5 | Press and hold the coin (about half a second), release. | Overlay over the current tab. A short tap still opens the chat. | |
| 1.6 | Trigger again while the overlay is listening. | Ignored: one overlay, one recording. | |

## 2. States (English command: "Spent 250 on lunch")
| # | Expected | Pass/Fail, notes |
|---|---|---|
| 2.1 | Listening: listening pose, Pappu blinks, gold ring grows with your voice (quiet = gentle breathing). | |
| 2.2 | Stops about 1.2 s after you stop talking; your words appear in quotes; thinking pose with orbiting dots, "One sec…". | |
| 2.3 | Speaking: talking pose bounces while the reply plays; reply in a speech bubble. | |
| 2.4 | Result card: "Added", ₹250, Food, Undo. Happy pose with a small bounce. | |
| 2.5 | Closes on its own about 2.5 s after the reply ends; Pappu shrinks away. Home totals updated. | |
| 2.6 | Repeat, tap the card while it shows: it stays until closed. | |
| 2.7 | Repeat, tap Undo: "Undone.", row gone from History. | |
| 2.8 | "How much did I spend this week?": answer text, no card. | |
| 2.9 | Add past a budget (set a small Food budget first): warning line, concerned pose. | |
| 2.10 | "Paid the bill" (no amount): confused pose, question shown, Talk again listens. | |

## 3. Malayalam
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 3.1 | Me > Language മലയാളം, summon. | "കേൾക്കുന്നു…". | |
| 3.2 | Say "ചായ 20 രൂപ". | Transcript, reply and card in Malayalam, spoken in Malayalam. No clipped letters on long lines; buttons not cut off. | |

## 4. Confirmation by voice
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 4.1 | "Delete the 20 rupees tea". | Question with അതെ/വേണ്ട (Yes/No); after it is spoken, a second cue and Pappu listens (does not record itself). | |
| 4.2 | Say "sheri" / "yes" / "ശരി". | Deleted, spoken, overlay closes. | |
| 4.3 | Repeat, tap No during the second listen. | Mic stops, "Cancelled.", row kept. | |
| 4.4 | Repeat and stay silent. | "I didn't hear anything" + Retry; card still there; no auto close. | |

## 5. Errors (each shows a short message and Retry, never a stuck spinner)
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 5.1 | Fresh install, deny the mic. | Mic message, Open settings and Try again; concerned pose with a shake. | |
| 5.2 | Say nothing for 8 s. | "I didn't hear anything." Retry listens again. | |
| 5.3 | Mobile data off, speak. | "Can't reach Pappu…". Data on, Retry: same request resent, one transaction only. | |
| 5.4 | Backend asleep (idle 20 min), speak. | Waits, then reply; or "still working" with Retry (no duplicate row after Retry). | |

## 6. Leaving
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 6.1 | Android back while listening. | Closes, nothing sent, mic indicator off. | |
| 6.2 | Tap the scrim; swipe Pappu down; tap X. | Each closes and discards. A short drag springs back. | |
| 6.3 | Home button while Pappu speaks. | Speech stops, overlay gone when you return. | |
| 6.4 | First-ever use: permission prompt appears. | Overlay stays open behind it; after Allow it listens. | |

## 7. Accessibility and comfort
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 7.1 | Reduce motion / Remove animations on. | Simple fades, static ring, no bounce, blink, shake or orbit. | |
| 7.2 | TalkBack on (iOS: VoiceOver). | "Listening…", "One sec…", the reply and errors are read; focus stays in the overlay; Pappu not focusable; X, Yes/No, Retry, Undo labelled. | |
| 7.3 | Haptics. | Light tick on summon, success tick on a result, error tick on errors. | |
| 7.4 | Status bar. | Dark icons over the cream scrim on every screen. | |

## 8. Smoothness (judge by eye; needs a real device)
| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 8.1 | Low-end Android, summon 5 times. | Summon spring, ring and dots smooth (about 60 fps), no hitch when the overlay opens. | |
| 8.2 | Cold start time with and without the feature build. | No noticeable difference. | |
