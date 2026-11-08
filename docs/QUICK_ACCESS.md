# Quick access: press a button and talk

Opening the link `pappu://listen` starts Pappu's assistant and listens right away. Anything
that can open a URL (or launch Pappu's built in entry points below) can become a "talk to
Pappu" button. There is no wake word and no background listening: the app comes to the
front, plays a short cue, and records one command.

What happens after the link:

1. Pappu waits for startup (fonts, server health check, session restore). A link waits up to
   2 minutes, so a sleeping Render server is fine.
2. Signed out: the sign in screen shows. Listening starts if you sign in within 60 seconds;
   otherwise the app just opens.
3. The mic permission prompt shows the first time. Nothing records before it is granted.
4. A cue plays, then Pappu records until you pause for about 1.2 seconds (8 seconds at most).
   Silence only is discarded.
5. The reply is spoken in its language, even with Me > Voice replies off. If Pappu asks you to
   confirm, it listens once more: say yes / sheri / athe / ശരി or no / venda / illa / വേണ്ട.

A link that arrives while Pappu is already recording is ignored.

## Android

Install a build that includes this feature (EAS build, see the checklist), open Pappu once.

### App icon long press
Long press the Pappu icon and tap **Talk to Pappu**. Drag it to the home screen for a one tap
shortcut.

### Quick Settings tile
1. Swipe down twice from the top of the screen.
2. Tap the pencil (Edit).
3. Drag **Talk to Pappu** into your active tiles.
4. Tap the tile. On a locked phone you unlock first.

### Power button / assist gesture (default digital assistant)
1. Settings > Apps > Default apps > Digital assistant app > **Pappu**.
   (This replaces Google Assistant / Gemini for the assist gesture.)
2. Pixel: Settings > System > Gestures > Press and hold power button > **Digital assistant**.
   Other brands name this differently; some keep the power button for their own assistant.
3. Long press the power button (or swipe up from a bottom corner) to talk to Pappu.

### Any other button or gesture
Button remapping and automation apps (for example Button Mapper, Tasker, Samsung Modes and
Routines) can run "Open URL" with `pappu://listen`.

### Test it from a computer
```bash
adb shell am start -a android.intent.action.VIEW -d "pappu://listen"
```

## iOS (no extra native code)

### 1. Make the shortcut once
1. Open the **Shortcuts** app and tap **+**.
2. Add action > search **Open URLs** > set the URL to `pappu://listen`.
3. Rename the shortcut to **Talk to Pappu** and tap Done.
4. Run it once and choose **Always Allow** when asked to open Pappu.

### 2. Map it
- **Action Button** (iPhone 15 Pro and later): Settings > Action Button > swipe to
  **Shortcut** > choose **Talk to Pappu**. Press and hold the Action Button to talk.
- **Back Tap**: Settings > Accessibility > Touch > Back Tap > Double Tap (or Triple Tap) >
  choose **Talk to Pappu**. Tap the back of the phone to talk.
- **Lock Screen control** (iOS 18 and later): long press the Lock Screen > Customize >
  Lock Screen > tap a control at the bottom (remove one first if both slots are used) >
  search **Shortcut** > choose **Talk to Pappu**. The phone asks you to unlock before Pappu
  opens. The same control can go in Control Center.
- **App icon**: long press the Pappu icon and tap **Talk to Pappu** (no setup needed).

### Test it from a Mac (simulator)
```bash
xcrun simctl openurl booted "pappu://listen"
```

## Not built (and what it would take)

### iOS App Intents
App Intents would make "Talk to Pappu" appear on its own in Shortcuts, Siri, Spotlight and
the Action Button list, with no manual shortcut. It needs Swift code in the app target:
an `AppIntent` with `openAppWhenRun = true` that hands `pappu://listen` to the app, and an
`AppShortcutsProvider` with Siri phrases. In this Expo project that means a small local Expo
module or config plugin adding the Swift files, then an EAS iOS build to verify. Roughly half
a day to a day. A native Lock Screen / Control Center button (`ControlWidget`, iOS 18) also
needs a WidgetKit extension target: about another day.

### Android VoiceInteractionService
Not needed to be the default assistant: the ASSISTANT role accepts an app with an
`ACTION_ASSIST` activity (AOSP "Android roles"), and with no VoiceInteractionService the
system opens that activity on the assist gesture. A VoiceInteractionService would only add an
overlay that listens on top of other apps and access to the screen's assist context. It
needs a VoiceInteractionService, a VoiceInteractionSessionService and session UI, a
RecognitionService and an XML descriptor, plus testing across brands (the role also resets on
reinstall). Roughly 2 to 3 days.
