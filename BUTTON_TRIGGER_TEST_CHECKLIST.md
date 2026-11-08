# Button Trigger Test Checklist (real phone)

Manual run of "press a button and talk" (`pappu://listen`) on a physical phone. Setup steps
for every entry point are in `docs/QUICK_ACCESS.md`; the same steps show on Me > Quick
access. Expected texts come from the composer templates and screen code, so a mismatch is a
real finding. Write Pass / Fail and a note for every row.

**Device:** ________ **OS:** ____ **Build:** ________ **Date:** ________ **Tester:** ________

What every successful trigger looks like ("listen run" below): the assistant opens, a short
two tone cue plays, the coin mic shows **Listening…**, recording stops on its own about 1.2 s
after you stop talking (8 s at most), the reply appears and is **spoken**, and the mic goes
back to idle.

## 0. Setup

- [ ] Android: build and install the `preview` APK **from this branch** (`DEPLOY.md` §4):
      `cd frontend && npx eas-cli build --platform android --profile preview`.
      Expo Go cannot test this (no `pappu://` scheme, tile, assist activity or quick action).
- [ ] iOS (if testing): a development or internal build from this branch, plus the
      **Talk to Pappu** shortcut from `docs/QUICK_ACCESS.md` (Shortcuts > Open URLs).
- [ ] Backend deployed; `curl https://pappu-78n5.onrender.com/health` returns ok.
- [ ] Signed in with a **test** account. Phone volume up, not on silent. Quiet room.
- [ ] Open the app once after install (registers the icon quick action), then close it.
- [ ] Me > Voice replies **off** for §6 (the trigger must speak anyway), on elsewhere is fine.
- [ ] Android helper for links: `adb shell am start -a android.intent.action.VIEW -d "pappu://listen"`.

## 1. Cold start from the link

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 1.1 | Force close Pappu. Run the adb command (Android) or the Talk to Pappu shortcut (iOS). | Splash, then a listen run. No tap needed. | |
| 1.2 | Same, and say **"Spent 120 on tea"**. | "Added ₹120 to Food." spoken in English. Home and History show one ₹120 Food row. | |
| 1.3 | Same, and say nothing for 10 s. | Recording stops by itself at about 8 s. Red banner "No speech detected. Please try again." Mic idle, nothing sent, no new chat bubble. | |
| 1.4 | Same, and talk nonstop for more than 8 s. | Recording is cut at 8 s and still sent. | |

## 2. Cold start from the app icon long press

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 2.1 | Force close. Long press the Pappu icon. | Menu shows **Talk to Pappu** (Android: Pappu icon; iOS: mic symbol). | |
| 2.2 | Tap **Talk to Pappu**. | Listen run. | |
| 2.3 | Android: drag Talk to Pappu to the home screen, force close, tap the pinned shortcut. | Listen run. | |
| 2.4 | With the app already open on History, long press the icon > Talk to Pappu. | Assistant opens over History, listen run. | |

## 3. Quick Settings tile (Android)

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 3.1 | Swipe down twice > pencil > find **Talk to Pappu** (mic icon) > drag it into active tiles. | Tile is listed and added. | |
| 3.2 | Force close Pappu, unlock the phone, tap the tile. | Shade collapses, listen run. | |
| 3.3 | Lock the phone (with a PIN), pull down Quick Settings on the lock screen, tap the tile. | You are asked to unlock; after unlocking, listen run. | |
| 3.4 | Android 14 or later: repeat 3.2. | Same as 3.2 (no crash: API 34+ uses the PendingIntent path). Note the Android version. | |

## 4. Power button / assist gesture (Android, default digital assistant)

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 4.1 | Settings > Apps > Default apps > Digital assistant app. | **Pappu** is in the list. Select it. | |
| 4.2 | Pixel: Settings > System > Gestures > Press and hold power button > Digital assistant. Long press power. | Listen run. Note the brand if the setting is missing. | |
| 4.3 | Swipe up from a bottom corner (gesture navigation) or long press home (3 button). | Listen run. | |
| 4.4 | Switch the digital assistant back to Google/Gemini afterwards. | Assist gesture opens Google again. | |

## 5. App backgrounded (warm start)

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 5.1 | Open Pappu on Home, press the home button, run the adb command / shortcut. | App returns, assistant opens, listen run. | |
| 5.2 | Pappu already on the assistant screen and idle; trigger again. | Same screen (no second assistant stacked), listen run. | |
| 5.3 | Start a recording by tapping the coin mic; while it records, trigger again. | Ignored: the running recording continues, no second cue, no restart. | |
| 5.4 | Trigger twice quickly (double press the Action Button / tile). | One cue, one recording. | |
| 5.5 | Trigger, then close the assistant (X) while it is listening. | Recording stops, nothing is sent; the mic indicator (Android green dot / iOS orange dot) turns off. | |
| 5.6 | Me > Quick access > **Test it**. | Listen run. | |

## 6. Spoken reply with Voice replies off

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 6.1 | Me > Voice replies off. Trigger and say **"Spent 50 on auto"**. | "Added ₹50 to Transport." **spoken** (the trigger overrides the setting). | |
| 6.2 | Then tap the coin mic yourself and say "Spent 40 on tea". | Reply shown but **not** spoken (setting still respected for taps). | |

## 7. Signed out

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 7.1 | Sign out. Force close. Trigger. | Sign in screen. No cue, no recording. | |
| 7.2 | Sign in within 60 s of the sign in screen appearing. | After sign in, the assistant opens and a listen run starts. | |
| 7.3 | Sign out, trigger, wait more than 60 s, then sign in. | Home opens normally; no assistant, no recording. | |

## 8. Microphone permission denied

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 8.1 | Fresh install or clear app data, sign in, trigger. | System mic prompt shows **before** any cue or recording. | |
| 8.2 | Choose **Don't allow**. | Red banner "Microphone permission is required to record voice commands." with **Settings**. No cue, no mic indicator, mic idle. | |
| 8.3 | Trigger again. | Same banner, no crash (Android may not show the prompt again). | |
| 8.4 | Grant the permission in Settings, return, trigger. | Listen run. | |

## 9. Malayalam and English commands

Me > Language English unless noted. Check the reply text, the spoken language, and Home.

| # | Say after the cue | Expected | Pass/Fail, notes |
|---|---|---|---|
| 9.1 | "Spent 250 on lunch" | "Added ₹250 to Food." spoken in English. | |
| 9.2 | "ചായ 20 രൂപ" | "ഭക്ഷണം വിഭാഗത്തിൽ ₹20 ചേർത്തു." spoken in Malayalam (amount read as "20 രൂപ"). | |
| 9.3 | "chaya 20" (Manglish) | ₹20 added to Food, reply language as the app picks for Manglish. | |
| 9.4 | "How much did I spend this week?" | Week total matching Home, spoken. | |
| 9.5 | "ഈ ആഴ്ച എത്ര ചെലവായി?" | Week total in Malayalam, spoken in Malayalam. | |

## 10. Confirmation by voice

Needs an existing row to delete (for example the ₹20 Food from 9.2).

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 10.1 | Trigger, say **"Delete the 20 rupees tea"**. | Card and spoken question "Delete Food ₹20 on <date>?". After the question finishes, a second cue plays and Pappu listens again (it must not record its own voice). | |
| 10.2 | Answer **"yes"**. | "Deleted Food ₹20 …" spoken. Row gone from History. No third listen. | |
| 10.3 | Repeat with **"sheri"**, then **"ശരി"**. | Same as 10.2. | |
| 10.4 | Repeat with **"venda"** (or "no", "illa", "വേണ്ട"). | "Cancelled." spoken; row still there. | |
| 10.5 | Repeat and stay silent on the second listen. | "No speech detected. Please try again." Card stays; tapping Confirm/Cancel still works. | |
| 10.6 | Malayalam question: Me > Language Malayalam, trigger, "ഇന്നലത്തെ ചായ ഒഴിവാക്കൂ". | Question spoken in Malayalam ("…ഒഴിവാക്കട്ടെ?"), second listen, "ശരി" deletes. | |

## 11. Render cold start delay

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 11.1 | Leave the backend idle about 20 min. Force close Pappu. Trigger. | After about 3 s **"Waking Pappu up"**. No cue and no recording yet. | |
| 11.2 | Wait for Home to load (30 to 60 s). | The assistant then opens by itself and a listen run starts. | |
| 11.3 | Repeat 11.1 with mobile data off; at "Can't reach Pappu" turn data on and tap Retry within 2 minutes. | After Home loads, the listen run starts. | |
| 11.4 | Repeat 11.3 but wait more than 2 minutes before Retry. | Home loads; no automatic listening (an old trigger is dropped). | |

## 12. Silence detection tuning

Thresholds: speech above -35 dBFS, 1.2 s of silence after speech, 8 s cap, first 0.3 s ignored
(`HANDS_FREE` in `frontend/src/components/MicButton.js`). Note any misfires.

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 12.1 | Speak softly at arm's length. | Still detected; stops after the pause, not at 8 s. | |
| 12.2 | Pause about 0.5 s mid sentence ("Spent 250 … on lunch"). | Not cut off at the short pause. | |
| 12.3 | Fan or TV on in the background, say nothing. | Discarded at 8 s ("No speech detected"), or note if noise counts as speech. | |
| 12.4 | Bluetooth headset connected. | Cue and reply play in the headset; recording works. | |

## Results

| Section | Pass | Fail | Notes |
|---|---|---|---|
| 1 Cold start link | | | |
| 2 Icon long press | | | |
| 3 Quick Settings tile | | | |
| 4 Power button | | | |
| 5 Backgrounded | | | |
| 6 Voice replies off | | | |
| 7 Signed out | | | |
| 8 Permission denied | | | |
| 9 Languages | | | |
| 10 Confirmation by voice | | | |
| 11 Render cold start | | | |
| 12 Silence tuning | | | |
