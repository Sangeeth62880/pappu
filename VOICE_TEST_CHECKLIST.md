# Voice Test Checklist (real phone)

Manual run on a physical Android phone with the `preview` APK (see `DEPLOY.md` §4).
Expected texts below are copied from the composer templates and screen code, so a
mismatch is a real finding. Write Pass / Fail and a note for every row.

**Device:** ________ **Android:** ____ **Build:** ________ **Date:** ________ **Tester:** ________

## 0. Setup

- [ ] Backend deployed with all migrations, including `20261108000000_create_category_budgets.sql` (`DEPLOY.md` §1). `curl https://pappu-78n5.onrender.com/health` returns `{"status":"ok","database":"connected"}`.
- [ ] Signed in with a **test** account that has no important data.
- [ ] Me → Language set to **English** to start. Phone volume up, not on silent.
- [ ] Quiet room for the main run; one noisy room pass at the end (§10).
- [ ] After every action, open Home and History to check the dashboard matches what Pappu said.

## 1. Cold start and retry

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 1.1 | Leave the backend idle about 20 min (Render free plan sleeps). Force-close and open the app. | After about 3 s: **"Waking Pappu up"** with "The server is waking up after being idle. This takes a few moments." Then Home loads. | |
| 1.2 | Repeat 1.1 with mobile data off. | **"Can't reach Pappu"** with a **Retry** button. Turn data on, tap Retry: Home loads. | |
| 1.3 | Right after a cold start, hold the mic and say **"Spent 120 on tea"**. Wait, even if it takes 30 to 60 s. | One reply: "Added ₹120 to Food." History shows **exactly one** ₹120 Food row (client retries reuse the same `client_msg_id`; a still-running request answers 409 and the app re-polls). | |
| 1.4 | On a slow network, send a voice command and keep the app open until it answers. | No duplicate user bubble, no error bubble left behind, one transaction. | |

## 2. Microphone permission

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 2.1 | Fresh install (or clear app data). Tap the mic, choose **Don't allow**. | Red banner: "Microphone permission is required to record voice commands." with a **Settings** link. Pappu does not stay in Listening or Thinking. | |
| 2.2 | Tap **Settings**. | Android app settings open for Pappu. | |
| 2.3 | Grant microphone, go back, tap the mic. | Recording starts (pulse ring, "Listening…"). Banner gone. | |
| 2.4 | Revoke the permission in Android settings while the app is in the background, return, tap the mic. | Same banner as 2.1, no crash. | |

## 3. English phrases

Check the reply text, that it is **spoken in English**, and the Home dashboard.

| # | Say | Expected reply | Pass/Fail, notes |
|---|---|---|---|
| 3.1 | "Spent 250 on lunch" | "Added ₹250 to Food." | |
| 3.2 | "Spent 250 on lunch and 80 on auto" | "Added ₹250 to Food and Added ₹80 to Transport." Two rows in History. | |
| 3.3 | "Sent 500 to Pooja" (Pooja not a contact yet) | "New contact: Pooja. Add them?" Say "yes": "Created contact Pooja and recorded transaction." | |
| 3.4 | "How much did I spend this week?" | "Spent ₹… from … to …" matching Home's Week total. | |
| 3.5 | "Who owes me money?" | "Pooja owes you ₹500." | |
| 3.6 | "Spent 1.5k on shopping" | "Added ₹1,500 to Shopping." | |
| 3.7 | "Paid the bill" (no amount) | Pappu asks how much; nothing saved. | |

## 4. Malayalam and Manglish phrases

| # | Say | Expected | Pass/Fail, notes |
|---|---|---|---|
| 4.1 | "ഊണിന് 250 രൂപ ചെലവായി" | Reply "ഭക്ഷണം വിഭാഗത്തിൽ ₹250 ചേർത്തു." **spoken in Malayalam**, amount heard as "250 രൂപ". | |
| 4.2 | "രാഹുലിന് 500 രൂപ കൊടുത്തു" | Malayalam reply about Rahul and ₹500 (new contact question first if Rahul is new). | |
| 4.3 | "ഈ ആഴ്ച എത്ര ചെലവായി" | Malayalam total for this week, same number as Home. | |
| 4.4 | Me → Language **English**. Say Manglish "Anu enikku 500 thannu". | Reply in **English** (Manglish follows the profile language). | |
| 4.5 | Me → Language **മലയാളം**. Say the same Manglish phrase. | Reply in **Malayalam script**, spoken in Malayalam. | |
| 4.6 | Malayalam delete: "ഇന്നലത്തെ ഭക്ഷണം 600 ഒഴിവാക്കൂ" (with such a row) | Malayalam question "…ഒഴിവാക്കട്ടെ?". Say "അതെ" or "athe": deleted. Say "വേണ്ട" or "venda" instead: "റദ്ദാക്കി." | |

## 5. Cancel mid-record

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 5.1 | Start recording, close the voice sheet (X or swipe down) while still listening. | Recording stops. No user bubble, no transaction, no reply plays. | |
| 5.2 | Start recording, stop, then close the sheet while "Pappu is thinking". | The late transcript is discarded: no bubble or transaction appears afterwards. | |
| 5.3 | Double tap the mic quickly. | One recording starts, no error, no stuck state. | |
| 5.4 | After 5.1 to 5.3, record "Spent 50 on tea". | Works normally. | |
| 5.5 | Record silence for 3 s and stop. | "No speech detected. Please try again." or "Didn't catch that. Try again?"; nothing saved. | |

## 6. Offline during upload

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 6.1 | Start recording "Spent 300 on dinner", switch on airplane mode, then stop. | An error such as "Network request failed" or "Request timed out". Pappu leaves Thinking. Nothing saved. | |
| 6.2 | Airplane mode off. Record the same phrase. | "Added ₹300 to Food." **One** row in History (not two). | |
| 6.3 | Send a typed message in airplane mode. | Error bubble, no crash. After reconnecting, the next message works. | |

## 7. TTS failure and playback

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 7.1 | Say a command, and switch on airplane mode the moment the reply **text** appears (before audio starts). | Reply text stays visible, no crash, state returns to idle. Next command (online) speaks normally. | |
| 7.2 | Send two commands back to back. | Only one voice plays at a time; the first stops when the second starts. | |
| 7.3 | Me → **Voice replies** off, then send a voice command. | **Known gap:** the toggle is saved (`PATCH /profile`) but no playback code reads `voice_replies`, so Pappu still speaks. Record what happens. | |
| 7.4 | Phone on silent / Do Not Disturb. | Record whether replies are audible; no crash either way. | |

## 8. Add, edit, delete, undo by voice

Do these in order on fresh data.

| # | Say | Expected | Pass/Fail, notes |
|---|---|---|---|
| 8.1 | "Spent 80 on auto" | "Added ₹80 to Transport." | |
| 8.2 | "Change it to 100" (within 10 min) | "Changed Transport ₹80 on <date> to ₹100. Say undo to revert." No confirmation (just touched). | |
| 8.3 | "Undo" | "Undone last action." History shows ₹80 again. | |
| 8.4 | Edit a row older than 10 min: "Change my last food transaction to 400" | Confirmation "Change Food ₹… on <date> to ₹400?". Say "yes": updated. Nothing changes before "yes". | |
| 8.5 | "Delete my last food transaction" | "Delete Food ₹… on <date>?" with a card. Say "no": "Cancelled." Row still there. | |
| 8.6 | Repeat 8.5, say "yes". | "Deleted Food ₹… on <date>." Home updates without refresh. | |
| 8.7 | Make two Food ₹200 rows, then "Delete food 200". | "Which one? 1) Food ₹200 on … , 2) …". Say "the first one" or tap 1, then confirm. Only that row is deleted. | |
| 8.8 | "Delete all transactions" | Refuses bulk delete; nothing deleted. | |
| 8.9 | "Undo" right after 8.6 | The deleted row comes back. | |

## 9. Budgets by voice and on the Me screen

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 9.1 | Say "Set food budget 5000". | "Set your Food budget to ₹5,000 a month." Me → Budgets shows a Food row "₹… of ₹5,000". | |
| 9.2 | Say "How much budget left for food?" | "Food: ₹X of ₹5,000 spent this month, ₹Y left." X matches the Food bar on Me. | |
| 9.3 | Say "Make food budget 6000". | "Changed your Food budget from ₹5,000 to ₹6,000 a month." | |
| 9.4 | Say "ഭക്ഷണത്തിന്റെ ബജറ്റിൽ എത്ര ബാക്കിയുണ്ട്?" | Malayalam reply "ഭക്ഷണം: ഈ മാസം ₹6,000 ബജറ്റിൽ … ചെലവായി, … ബാക്കിയുണ്ട്.", amounts spoken as "… രൂപ". | |
| 9.5 | Say "Set salary budget 5000". | "Budgets can be set for Food, Transport, Shopping, Bills, Entertainment and Other." Nothing saved. | |
| 9.6 | Me → Budgets → **Set a budget** → Transport → 1000 → Save. | Sheet closes, Transport row appears with its bar. | |
| 9.7 | Say "Spent 850 on cab" (Transport at ₹0 of ₹1,000). | "Added ₹850 to Transport. Heads up: Transport is at 85% of its ₹1,000 budget this month." Pappu looks concerned. | |
| 9.8 | Say "Spent 50 on bus". | "Added ₹50 to Transport." **No** alert (still near, no new crossing). | |
| 9.9 | Say "Spent 200 on auto". | "… Heads up: Transport is over budget this month, ₹1,100 of ₹1,000." Me bar turns red, caption "₹100 over budget". | |
| 9.10 | Go to Me right after 9.9 without pulling to refresh. | Budgets card already shows the new spending. | |
| 9.11 | Say "Alert me if I cross 10000 spending". | "That is not available yet." | |

## 10. Noise and accents (spot check)

| # | Steps | Expected | Pass/Fail, notes |
|---|---|---|---|
| 10.1 | Repeat 3.1 and 4.1 with a TV or traffic in the background. | Same results, or a clarifying question; never a wrong amount saved silently. | |
| 10.2 | A second speaker repeats 3.1, 4.1, 9.1. | Same results. | |

## Result

- Total rows: ____ Pass: ____ Fail: ____
- Bugs filed: ______________________________________________
