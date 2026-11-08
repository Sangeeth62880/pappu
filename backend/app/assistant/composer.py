"""
Deterministic Response Composer for Pappu Assistant v2.

Generates user-facing reply_text and spoken_text from execution results,
pending items, and plans. Never calls an LLM.

Replies are English (en) or Malayalam script (ml). The reply language is resolved
before composing (resolve_reply_language): detected 'mixed' (Manglish) follows the
profile preference, so a single reply never blends scripts inside one sentence.
Every reply string lives in TEMPLATES with an 'en' and an 'ml' version.
Formats numbers in Indian currency format without trailing .00 on whole amounts.
Enforces Rule 9: Zero em dashes or hyphens used as punctuation.
"""

import re
from decimal import Decimal
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Union, Tuple, Literal
from app.assistant.schemas import Plan, Action, PendingSummary


REPLY_LANGUAGES = ("en", "ml")


def resolve_reply_language(detected: Optional[str], preferred: Optional[str]) -> str:
    """
    Reply language for one message: the planner's detected language when it is 'en' or 'ml'.
    Detected 'mixed', missing or invalid values fall back to the profile preference.
    Returns 'en' or 'ml'.
    """
    pref = "ml" if str(preferred or "").strip().lower() == "ml" else "en"
    det = str(detected or "").strip().lower()
    if det in REPLY_LANGUAGES:
        return det
    return pref


def tts_language_code(lang: Optional[str]) -> str:
    """Bulbul v3 target_language_code for a reply language."""
    return "ml-IN" if lang == "ml" else "en-IN"


# ------------------------------------------------------------------------------
# Reply templates. Every key must have both 'en' and 'ml' (enforced by tests).
# ------------------------------------------------------------------------------

TEMPLATES: Dict[str, Dict[str, str]] = {
    # Add
    "add.repayment": {
        "en": "{contact} paid you {amt}.",
        "ml": "{contact} നിങ്ങൾക്ക് {amt} തന്നു.",
    },
    "add.i_owe": {
        "en": "Noted: you owe {contact} {amt}.",
        "ml": "{contact} നിങ്ങളിൽ നിന്ന് {amt} വാങ്ങാനുണ്ട് എന്ന് രേഖപ്പെടുത്തി.",
    },
    "add.they_owe": {
        "en": "Noted: {contact} owes you {amt}.",
        "ml": "{contact} നിങ്ങൾക്ക് {amt} തരാനുണ്ട് എന്ന് രേഖപ്പെടുത്തി.",
    },
    "add.sent": {
        "en": "{amt} sent to {contact}.",
        "ml": "{amt} അയച്ചു, {contact} എന്ന പേരിൽ രേഖപ്പെടുത്തി.",
    },
    "add.income": {
        "en": "Added {amt} {cat} income.",
        "ml": "{cat} വിഭാഗത്തിൽ {amt} വരുമാനമായി ചേർത്തു.",
    },
    "add.expense": {
        "en": "Added {amt} to {cat}.",
        "ml": "{cat} വിഭാഗത്തിൽ {amt} ചേർത്തു.",
    },
    # Edit
    "edit.amount": {
        "en": "Changed {label} {amt_prev}{date_part} to {amt_new}. Say undo to revert.",
        "ml": "{date_part}{label} {amt_prev} എന്നത് {amt_new} ആക്കി മാറ്റി. മാറ്റം വേണ്ടെങ്കിൽ അൺഡു എന്ന് പറയൂ.",
    },
    "edit.updated": {
        "en": "Updated {label} transaction. Say undo to revert.",
        "ml": "{label} ഇടപാട് പുതുക്കി. മാറ്റം വേണ്ടെങ്കിൽ അൺഡു എന്ന് പറയൂ.",
    },
    # Delete
    "delete.generic": {
        "en": "Deleted transaction.",
        "ml": "ഇടപാട് ഒഴിവാക്കി.",
    },
    "delete.amount": {
        "en": "Deleted {label} {amt}{date_part}.",
        "ml": "{date_part}{label} {amt} ഒഴിവാക്കി.",
    },
    "delete.label": {
        "en": "Deleted {label}{date_part}.",
        "ml": "{date_part}{label} ഒഴിവാക്കി.",
    },
    # Undo
    "undo.done": {
        "en": "Undone last action.",
        "ml": "അവസാനത്തെ പ്രവർത്തനം റദ്ദാക്കി.",
    },
    "undo.nothing": {
        "en": "Nothing to undo.",
        "ml": "റദ്ദാക്കാൻ ഒന്നുമില്ല.",
    },
    # Query: balances
    "balances.none_owed_to_me": {
        "en": "Nobody owes you anything right now.",
        "ml": "ഇപ്പോൾ ആരും നിങ്ങൾക്ക് പണം തരാനില്ല.",
    },
    "balances.none_i_owe": {
        "en": "You do not owe anyone anything right now.",
        "ml": "ഇപ്പോൾ നിങ്ങൾ ആർക്കും പണം കൊടുക്കാനില്ല.",
    },
    "balances.none": {
        "en": "No outstanding balances right now.",
        "ml": "ഇപ്പോൾ തീർക്കാനുള്ള കണക്കുകൾ ഒന്നുമില്ല.",
    },
    "balances.owes_you": {
        "en": "{name} owes you {amt}.",
        "ml": "{name} നിങ്ങൾക്ക് {amt} തരാനുണ്ട്.",
    },
    "balances.you_owe": {
        "en": "You owe {name} {amt}.",
        "ml": "{name} നിങ്ങളിൽ നിന്ന് {amt} വാങ്ങാനുണ്ട്.",
    },
    "balances.settled": {
        "en": "Settled up with {name}.",
        "ml": "{name} ഒന്നും തരാനോ വാങ്ങാനോ ഇല്ല.",
    },
    # Query: category breakdown
    "breakdown.none": {
        "en": "No spending found{range}.",
        "ml": "{range}ചെലവുകൾ ഒന്നും കണ്ടെത്തിയില്ല.",
    },
    "breakdown.full": {
        "en": "Spending by category{range}: {items}.",
        "ml": "{range}വിഭാഗം തിരിച്ചുള്ള ചെലവ്: {items}.",
    },
    "breakdown.spoken": {
        "en": "Top spending{range}: {items}.",
        "ml": "{range}ഏറ്റവും കൂടുതൽ ചെലവ്: {items}.",
    },
    # Query: sum
    "sum.income_category": {
        "en": "Total {cat} income is {total}{range}.",
        "ml": "{range}{cat} വിഭാഗത്തിൽ ആകെ വരുമാനം {total}.",
    },
    "sum.income_range": {
        "en": "Received {total}{range}.",
        "ml": "{range}ആകെ {total} ലഭിച്ചു.",
    },
    "sum.income_total": {
        "en": "Total received is {total}.",
        "ml": "ആകെ ലഭിച്ചത് {total}.",
    },
    "sum.spent_category": {
        "en": "Total {cat} spending is {total}{range}.",
        "ml": "{range}{cat} വിഭാഗത്തിൽ ആകെ ചെലവ് {total}.",
    },
    "sum.spent_range": {
        "en": "Spent {total}{range}.",
        "ml": "{range}ആകെ {total} ചെലവാക്കി.",
    },
    "sum.total": {
        "en": "Total is {total}.",
        "ml": "ആകെ തുക {total}.",
    },
    # Query: count
    "count.one": {
        "en": "Found {count} transaction{range}.",
        "ml": "{range}{count} ഇടപാട് കണ്ടെത്തി.",
    },
    "count.many": {
        "en": "Found {count} transactions{range}.",
        "ml": "{range}{count} ഇടപാടുകൾ കണ്ടെത്തി.",
    },
    # Query: biggest
    "biggest.none": {
        "en": "No transactions found{range}.",
        "ml": "{range}ഇടപാടുകൾ ഒന്നും കണ്ടെത്തിയില്ല.",
    },
    "biggest.found": {
        "en": "Biggest transaction is {amt} {cat}{date_part}.",
        "ml": "ഏറ്റവും വലിയ ഇടപാട് {date_part}{cat} {amt}.",
    },
    # Query: compare
    "compare.result": {
        "en": "{p1}{r1} {t1}, {p2}{r2} {t2}, {direction} {diff}.",
        "ml": "{p1} {r1}{t1}, {p2} {r2}{t2}, {diff} {direction}.",
    },
    "compare.up": {"en": "up", "ml": "കൂടുതൽ"},
    "compare.down": {"en": "down", "ml": "കുറവ്"},
    # Query: list
    "list.full": {
        "en": "Found {count} transactions{range}: {items}.",
        "ml": "{range}{count} ഇടപാടുകൾ കണ്ടെത്തി: {items}.",
    },
    "list.spoken": {
        "en": "Top transactions{range}: {items}.",
        "ml": "{range}പ്രധാന ഇടപാടുകൾ: {items}.",
    },
    "list.item": {
        "en": "{amt} {cat} on {date}",
        "ml": "{date}ന് {cat} {amt}",
    },
    "query.done": {
        "en": "Query completed.",
        "ml": "പരിശോധിച്ചു.",
    },
    # Not found
    "none.generic": {
        "en": "Transaction not found.",
        "ml": "ഇടപാട് കണ്ടെത്തിയില്ല.",
    },
    "none.unknown_contact": {
        "en": "I don't know a contact named {name}.",
        "ml": "{name} എന്ന പേരിൽ ഒരു കോൺടാക്റ്റും ഇല്ല.",
    },
    "none.last_touched": {
        "en": "I don't know which transaction you mean.",
        "ml": "ഏത് ഇടപാടാണ് ഉദ്ദേശിച്ചത് എന്ന് മനസ്സിലായില്ല.",
    },
    "none.range": {
        "en": "No {desc}{range}.",
        "ml": "{range}{desc} ഒന്നും കണ്ടെത്തിയില്ല.",
    },
    "none.desc": {
        "en": "No {desc} found.",
        "ml": "{desc} ഒന്നും കണ്ടെത്തിയില്ല.",
    },
    "none.no_transactions": {
        "en": "No transactions found.",
        "ml": "ഇടപാടുകൾ ഒന്നും കണ്ടെത്തിയില്ല.",
    },
    "none.contact_transaction": {
        "en": "{contact} transaction",
        "ml": "{contact} എന്ന പേരിൽ ഇടപാട്",
    },
    "none.with_contact": {
        "en": "with {contact}",
        "ml": "{contact} എന്ന പേരിൽ",
    },
    # Words used inside other templates
    "word.expense": {"en": "expense", "ml": "ചെലവ്"},
    "word.income": {"en": "income", "ml": "വരുമാനം"},
    "word.transaction": {"en": "transaction", "ml": "ഇടപാട്"},
    "word.transactions": {"en": "transactions", "ml": "ഇടപാടുകൾ"},
    "word.contact": {"en": "contact", "ml": "കോൺടാക്റ്റ്"},
    "op.add": {"en": "add", "ml": "ചേർക്കൽ"},
    "op.edit": {"en": "edit", "ml": "മാറ്റം"},
    "op.delete": {"en": "delete", "ml": "ഒഴിവാക്കൽ"},
    "op.action": {"en": "action", "ml": "പ്രവർത്തനം"},
    "op.set_budget": {"en": "budget change", "ml": "ബജറ്റ് മാറ്റം"},
    # Date fragments. English attaches after the noun, Malayalam before it.
    "date.of": {"en": " on {date}", "ml": "{date}ലെ "},
    "range.on": {"en": " on {date}", "ml": "{date}ന് "},
    "range.same_month": {"en": " from {d1} to {d2} {month}", "ml": "{month} {d1} മുതൽ {d2} വരെ "},
    "range.span": {"en": " from {date1} to {date2}", "ml": "{date1} മുതൽ {date2} വരെ "},
    "range.since": {"en": " since {date}", "ml": "{date} മുതൽ "},
    "range.until": {"en": " until {date}", "ml": "{date} വരെ "},
    "range.all_time": {"en": " all time", "ml": "ഇതുവരെ "},
    # Budgets (monthly, per category)
    "budget.set": {
        "en": "Set your {cat} budget to {amt} a month.",
        "ml": "{cat} ബജറ്റ് മാസം {amt} ആയി സെറ്റ് ചെയ്തു.",
    },
    "budget.changed": {
        "en": "Changed your {cat} budget from {amt_prev} to {amt} a month.",
        "ml": "{cat} ബജറ്റ് {amt_prev} എന്നത് മാസം {amt} ആക്കി മാറ്റി.",
    },
    "budget.change_question": {
        "en": "Change your {cat} budget from {amt_prev} to {amt} a month?",
        "ml": "{cat} ബജറ്റ് {amt_prev} എന്നത് മാസം {amt} ആക്കി മാറ്റട്ടെ?",
    },
    "budget.left": {
        "en": "{cat}: {spent} of {budget} spent this month, {left} left.",
        "ml": "{cat}: ഈ മാസം {budget} ബജറ്റിൽ {spent} ചെലവായി, {left} ബാക്കിയുണ്ട്.",
    },
    "budget.over": {
        "en": "{cat}: {spent} of {budget} spent this month, {over} over budget.",
        "ml": "{cat}: ഈ മാസം {budget} ബജറ്റിൽ {spent} ചെലവായി, {over} കൂടുതലായി.",
    },
    "budget.none_for": {
        "en": "You have no {cat} budget yet.",
        "ml": "{cat} വിഭാഗത്തിന് ഇതുവരെ ബജറ്റ് ഇല്ല.",
    },
    "budget.none": {
        "en": "You have not set any budgets yet.",
        "ml": "ഇതുവരെ ഒരു ബജറ്റും സെറ്റ് ചെയ്തിട്ടില്ല.",
    },
    "budget.invalid_category": {
        "en": "Budgets can be set for {cats}.",
        "ml": "{cats} എന്നീ വിഭാഗങ്ങൾക്കാണ് ബജറ്റ് സെറ്റ് ചെയ്യാൻ കഴിയുക.",
    },
    "budget.alert_near": {
        "en": "Heads up: {cat} is at {pct}% of its {budget} budget this month.",
        "ml": "ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ {cat} ബജറ്റ് {budget}, അതിന്റെ {pct} ശതമാനം ചെലവായി.",
    },
    "budget.alert_over": {
        "en": "Heads up: your {cat} budget of {budget} is used up this month, {spent} spent.",
        "ml": "ശ്രദ്ധിക്കൂ: ഈ മാസത്തെ {cat} ബജറ്റ് {budget} തീർന്നു, ആകെ {spent} ചെലവായി.",
    },
    "budget.missing_category": {
        "en": "Which category is the budget for?",
        "ml": "ഏത് വിഭാഗത്തിനാണ് ബജറ്റ് എന്ന് പറയാമോ?",
    },
    # Chat
    "chat.greeting": {
        "en": "Hello! How can I help you manage your expenses today?",
        "ml": "നമസ്കാരം! ഇന്ന് നിങ്ങളുടെ ചെലവുകൾ കൈകാര്യം ചെയ്യാൻ ഞാൻ എങ്ങനെ സഹായിക്കട്ടെ?",
    },
    "chat.help": {
        "en": "I can help you track expenses, check balances, and search transactions. For example, say 'Spent 250 on lunch' or 'Who owes me money'.",
        "ml": "ചെലവുകൾ രേഖപ്പെടുത്താനും കണക്കുകൾ നോക്കാനും ഇടപാടുകൾ തിരയാനും ഞാൻ സഹായിക്കാം. ഉദാഹരണത്തിന്, 'ഉച്ചഭക്ഷണത്തിന് 250 ചെലവായി' എന്നോ 'ആരൊക്കെ എനിക്ക് പണം തരാനുണ്ട്' എന്നോ പറയൂ.",
    },
    "chat.off_topic": {
        "en": "I can only help with your money.",
        "ml": "പണവുമായി ബന്ധപ്പെട്ട കാര്യങ്ങളിൽ മാത്രമേ എനിക്ക് സഹായിക്കാൻ കഴിയൂ.",
    },
    "chat.unsupported": {
        "en": "That is not available yet.",
        "ml": "ആ സൗകര്യം ഇപ്പോൾ ലഭ്യമല്ല.",
    },
    "chat.unsupported_bulk": {
        "en": "I can't delete everything at once. Tell me which transaction to delete.",
        "ml": "എല്ലാം ഒരുമിച്ച് ഒഴിവാക്കാൻ കഴിയില്ല. ഏത് ഇടപാടാണ് ഒഴിവാക്കേണ്ടത് എന്ന് പറയൂ.",
    },
    # Clarify. English replies use the planner's question; Malayalam uses these by missing field.
    "clarify.generic": {
        "en": "Could you clarify that?",
        "ml": "ഒന്നുകൂടി വ്യക്തമാക്കാമോ?",
    },
    "clarify.amount": {
        "en": "How much was it?",
        "ml": "എത്ര രൂപയാണ് എന്ന് പറയാമോ?",
    },
    "clarify.date": {
        "en": "What is the correct date?",
        "ml": "ശരിയായ തീയതി പറയാമോ?",
    },
    "clarify.contact": {
        "en": "Who was it with?",
        "ml": "ആരുമായുള്ള ഇടപാടാണ് എന്ന് പറയാമോ?",
    },
    "clarify.category": {
        "en": "Which category is it?",
        "ml": "ഏത് വിഭാഗത്തിലാണ് എന്ന് പറയാമോ?",
    },
    # Pending confirmations and answers
    "pending.which_one": {"en": "Which one?", "ml": "ഏതാണ്?"},
    "pending.candidate": {
        "en": "{idx}) {cat} {amt} on {date}",
        "ml": "{idx}) {date}ലെ {cat} {amt}",
    },
    "pending.default_question": {
        "en": "Confirmation required.",
        "ml": "ഒന്ന് ഉറപ്പിക്കണം.",
    },
    "pending.delete_question": {
        "en": "Delete {label} {amt} on {date}?",
        "ml": "{date}ലെ {label} {amt} ഒഴിവാക്കട്ടെ?",
    },
    "pending.edit_question_amount": {
        "en": "Change {label} {amt}{date_part} to {amt_new}?",
        "ml": "{date_part}{label} {amt} എന്നത് {amt_new} ആക്കി മാറ്റട്ടെ?",
    },
    "pending.edit_question": {
        "en": "Change {label} {amt}{date_part}?",
        "ml": "{date_part}{label} {amt} മാറ്റട്ടെ?",
    },
    "pending.new_contact_question": {
        "en": "New contact: {name}. Add them?",
        "ml": "പുതിയ കോൺടാക്റ്റ്: {name}. ചേർക്കട്ടെ?",
    },
    "pending.contact_match_question": {
        "en": "Is this {name}?",
        "ml": "ഇത് {name} ആണോ?",
    },
    "pending.future_add_question": {
        "en": "Record {amt} for {date}?",
        "ml": "{amt} {date} എന്ന തീയതിയിൽ രേഖപ്പെടുത്തട്ടെ?",
    },
    "pending.superseded": {
        "en": "I cancelled the pending {op} of {subject}.",
        "ml": "മുമ്പ് ചോദിച്ച {subject} {op} റദ്ദാക്കി.",
    },
    "pending.multi_action_dropped": {
        "en": "I have asked about the first transaction. Please repeat the second request after confirming.",
        "ml": "ആദ്യത്തെ ഇടപാടിനെക്കുറിച്ചാണ് ചോദിച്ചത്. അത് ഉറപ്പിച്ച ശേഷം രണ്ടാമത്തെ കാര്യം വീണ്ടും പറയൂ.",
    },
    "pending.expired": {
        "en": "That request expired, please say it again.",
        "ml": "ആ അഭ്യർത്ഥനയുടെ സമയം കഴിഞ്ഞു, ഒന്നുകൂടി പറയൂ.",
    },
    "pending.cancelled": {"en": "Cancelled.", "ml": "റദ്ദാക്കി."},
    "pending.created_contact": {
        "en": "Created contact {name} and recorded transaction.",
        "ml": "{name} എന്ന പുതിയ കോൺടാക്റ്റ് ചേർത്ത് ഇടപാട് രേഖപ്പെടുത്തി.",
    },
    "pending.saved_alias": {
        "en": "Saved alias for {name} and recorded transaction.",
        "ml": "{name} എന്ന കോൺടാക്റ്റിന് പുതിയ വിളിപ്പേര് ചേർത്ത് ഇടപാട് രേഖപ്പെടുത്തി.",
    },
    "pending.recorded": {"en": "Recorded transaction.", "ml": "ഇടപാട് രേഖപ്പെടുത്തി."},
    "pending.select_number": {
        "en": "Please select an option by number (1 to {count}).",
        "ml": "1 മുതൽ {count} വരെയുള്ള ഒരു നമ്പർ തിരഞ്ഞെടുക്കൂ.",
    },
    "pending.invalid_number": {
        "en": "Please choose a valid number between 1 and {count}.",
        "ml": "1 മുതൽ {count} വരെയുള്ള ശരിയായ ഒരു നമ്പർ തിരഞ്ഞെടുക്കൂ.",
    },
    "pending.updated": {"en": "Updated transaction.", "ml": "ഇടപാട് പുതുക്കി."},
    "pending.updated_undo": {
        "en": "Updated transaction. Say undo to revert.",
        "ml": "ഇടപാട് പുതുക്കി. മാറ്റം വേണ്ടെങ്കിൽ അൺഡു എന്ന് പറയൂ.",
    },
    "pending.reply_hint": {
        "en": "Please reply with yes, no, or pick a number.",
        "ml": "അതെ, വേണ്ട, അല്ലെങ്കിൽ ഒരു നമ്പർ പറയൂ.",
    },
    # Errors and generic completions
    "error.multiple_matches": {
        "en": "Multiple transactions matched.",
        "ml": "ഒന്നിലധികം ഇടപാടുകൾ കണ്ടെത്തി.",
    },
    "error.nothing_pending": {
        "en": "Nothing is waiting for confirmation.",
        "ml": "ഉറപ്പിക്കാൻ ഒന്നും ബാക്കിയില്ല.",
    },
    "error.generic": {
        "en": "I couldn't record {target} because {err}.",
        "ml": "ഇത് ചെയ്യാൻ കഴിഞ്ഞില്ല. ഒന്നുകൂടി ശ്രമിക്കൂ.",
    },
    "op.done": {"en": "Operation completed.", "ml": "പൂർത്തിയായി."},
    "done": {"en": "Done.", "ml": "ശരി, കഴിഞ്ഞു."},
}

# Seeded category names (and the generic type words used as category fallbacks) in Malayalam.
CATEGORY_NAMES_ML: Dict[str, str] = {
    "food": "ഭക്ഷണം",
    "transport": "യാത്ര",
    "shopping": "ഷോപ്പിംഗ്",
    "bills": "ബില്ലുകൾ",
    "entertainment": "വിനോദം",
    "salary": "ശമ്പളം",
    "people": "ആളുകൾ",
    "other": "മറ്റുള്ളവ",
    "expense": "ചെലവ്",
    "income": "വരുമാനം",
}

MONTHS_ML: List[str] = [
    "ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ",
    "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ",
]

# Compare labels from the query executor ("This month", "last month", "Period 1"), keyed by slug.
PERIOD_LABELS_ML: Dict[str, str] = {
    "today": "ഇന്ന്",
    "yesterday": "ഇന്നലെ",
    "this_week": "ഈ ആഴ്ച",
    "last_week": "കഴിഞ്ഞ ആഴ്ച",
    "this_month": "ഈ മാസം",
    "last_month": "കഴിഞ്ഞ മാസം",
    "last_7_days": "കഴിഞ്ഞ 7 ദിവസം",
    "last_30_days": "കഴിഞ്ഞ 30 ദിവസം",
    "this_year": "ഈ വർഷം",
    "all_time": "ഇതുവരെ",
    "period_1": "ഒന്നാമത്തെ കാലയളവ്",
    "period_2": "രണ്ടാമത്തെ കാലയളവ്",
}

# Joins the sentences of a multi action reply.
_SENTENCE_JOINER = {"en": " and ", "ml": ", "}


def render(key: str, lang: str, **values: Any) -> str:
    """Formats TEMPLATES[key] in lang, falling back to English if lang is missing."""
    entry = TEMPLATES[key]
    template = entry.get(lang) or entry["en"]
    return template.format(**values)


def localize_category(name: Optional[str], lang: str) -> Optional[str]:
    """Malayalam name for a seeded category; other names (and English) are returned unchanged."""
    if lang != "ml" or not name:
        return name
    return CATEGORY_NAMES_ML.get(str(name).strip().lower(), name)


def _localize_period_label(label: str, lang: str) -> str:
    if lang != "ml" or not label:
        return label
    slug = str(label).strip().lower().replace(" ", "_")
    return PERIOD_LABELS_ML.get(slug, label)


def date_part(dt_str: str, lang: str) -> str:
    """' on 14 Oct' (en) or 'ഒക്ടോബർ 14ലെ ' (ml); empty when there is no date."""
    return render("date.of", lang, date=dt_str) if dt_str else ""


_RUPEE_RE = re.compile(r"₹(\d+(?:,\d+)*(?:\.\d+)?)")
_ENUMERATION_RE = re.compile(r"(\d+)\)")


def to_spoken(text: str, lang: str) -> str:
    """
    Phonetic cleanup of spoken_text for Bulbul v3.
    Malayalam: '₹1,500' becomes '1500 രൂപ', '1)' becomes '1.', parentheses are dropped.
    English is returned unchanged. Idempotent.
    """
    if lang != "ml" or not text:
        return text
    spoken = _RUPEE_RE.sub(lambda m: f"{m.group(1).replace(',', '')} രൂപ", text)
    spoken = _ENUMERATION_RE.sub(r"\1.", spoken)
    return spoken.replace("(", "").replace(")", "")


def format_inr(amount: Union[float, int, Decimal, None]) -> str:
    """
    Formats a number into Indian currency format:
    e.g. 250 -> '₹250'
    2000 -> '₹2,000'
    150000 -> '₹1,50,000'
    Whole numbers omit .00.
    """
    if amount is None:
        return "₹0"

    val = round(float(amount), 2)
    is_whole = val.is_integer()
    if is_whole:
        s = str(int(val))
    else:
        s = f"{val:.2f}"

    parts = s.split(".")
    integer_part = parts[0]

    # Handle negative numbers
    is_negative = integer_part.startswith("-")
    if is_negative:
        integer_part = integer_part[1:]

    if len(integer_part) > 3:
        last_three = integer_part[-3:]
        remaining = integer_part[:-3]
        groups = []
        while len(remaining) > 2:
            groups.insert(0, remaining[-2:])
            remaining = remaining[:-2]
        if remaining:
            groups.insert(0, remaining)
        formatted_int = ",".join(groups) + "," + last_three
    else:
        formatted_int = integer_part

    prefix = "-₹" if is_negative else "₹"
    if is_whole:
        return f"{prefix}{formatted_int}"
    return f"{prefix}{formatted_int}.{parts[1]}"


def format_date_short(d_val: Union[str, date, datetime, None], lang: str = "en") -> str:
    """
    Formats a date to a clean human string like '13 Oct' (en) or 'ഒക്ടോബർ 13' (ml).
    """
    if not d_val:
        return ""
    if isinstance(d_val, (date, datetime)):
        dt = d_val
    else:
        try:
            dt = date.fromisoformat(str(d_val).split("T")[0])
        except Exception:
            return str(d_val)

    if lang == "ml":
        return f"{MONTHS_ML[dt.month - 1]} {dt.day}"
    # e.g. 13 Oct
    return f"{dt.day} {dt.strftime('%b')}"


def format_range_from_dates(
    d_from: Union[str, date, datetime, None],
    d_to: Union[str, date, datetime, None],
    lang: str = "en",
) -> str:
    """
    Formats a date range into a clean human string without hyphens as punctuation (Rule 9).
    English examples (appended after the noun, leading space):
    - Same date: ' on 14 Oct'
    - Same month: ' from 5 to 11 Oct'
    - Different month: ' from 25 Sep to 5 Oct'
    - Lower bound only: ' since 5 Oct'
    - Upper bound only: ' until 11 Oct'
    Malayalam versions come first in the sentence and carry a trailing space instead.
    """
    if not d_from and not d_to:
        return ""

    def _parse(val):
        if not val:
            return None
        if isinstance(val, (date, datetime)):
            return val.date() if isinstance(val, datetime) else val
        try:
            return date.fromisoformat(str(val).split("T")[0].strip())
        except Exception:
            return None

    dt_from = _parse(d_from)
    dt_to = _parse(d_to)

    def _month(dt: date) -> str:
        return MONTHS_ML[dt.month - 1] if lang == "ml" else dt.strftime("%b")

    if dt_from and dt_to:
        if dt_from == dt_to:
            return render("range.on", lang, date=format_date_short(dt_from, lang))
        if dt_from.year == dt_to.year and dt_from.month == dt_to.month:
            return render("range.same_month", lang, d1=dt_from.day, d2=dt_to.day, month=_month(dt_from))
        return render(
            "range.span",
            lang,
            date1=format_date_short(dt_from, lang),
            date2=format_date_short(dt_to, lang),
        )
    elif dt_from:
        return render("range.since", lang, date=format_date_short(dt_from, lang))
    elif dt_to:
        return render("range.until", lang, date=format_date_short(dt_to, lang))
    return ""


def _compose_single_add(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    kind = data.get("kind") or data.get("type") or "expense"
    amt = format_inr(data.get("amount", 0))
    cat = data.get("category_name") or data.get("category") or "expense"
    contact = data.get("contact_name") or data.get("contact")

    if contact or kind == "person" or cat == "People":
        person_flow = data.get("person_flow")
        direction = data.get("direction")
        is_received = direction == "received" or data.get("type") == "income"

        if person_flow == "repayment":
            return render("add.repayment", lang, contact=contact, amt=amt)
        elif person_flow == "i_owe" or is_received:
            return render("add.i_owe", lang, contact=contact, amt=amt)
        elif person_flow == "they_owe":
            return render("add.they_owe", lang, contact=contact, amt=amt)
        else:
            return render("add.sent", lang, contact=contact, amt=amt)

    elif kind == "income" or data.get("type") == "income":
        return render("add.income", lang, amt=amt, cat=localize_category(cat, lang))

    else:
        return render("add.expense", lang, amt=amt, cat=localize_category(cat, lang))


def _compose_single_edit(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    prev = data.get("previous") or {}
    amt_new = format_inr(data.get("amount", 0))
    amt_prev = format_inr(prev.get("amount", 0))
    contact = data.get("contact_name") or data.get("contact")
    cat = data.get("category_name") or data.get("category") or "Shopping"
    label = contact if contact and str(contact).strip() else localize_category(cat, lang)

    dt_str = format_date_short(data.get("txn_date") or data.get("date") or prev.get("txn_date"), lang)

    if prev and "amount" in prev and amt_prev != amt_new:
        return render(
            "edit.amount",
            lang,
            label=label,
            amt_prev=amt_prev,
            date_part=date_part(dt_str, lang),
            amt_new=amt_new,
        )

    return render("edit.updated", lang, label=label)


def _compose_single_delete(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    contact = data.get("contact_name") or data.get("contact")
    cat = data.get("category_name") or data.get("category")
    amt_val = data.get("amount")
    amt = format_inr(amt_val) if amt_val is not None else ""
    dt_str = format_date_short(data.get("txn_date") or data.get("date"), lang)
    is_income = str(data.get("type", "")).strip().lower() == "income"

    if contact and str(contact).strip():
        label = str(contact).strip()
    elif cat and str(cat).strip() and str(cat).strip().lower() not in ("people", "other", "expense", "income"):
        label = localize_category(str(cat).strip(), lang)
    elif amt:
        label = render("word.income" if is_income else "word.expense", lang)
    else:
        return render("delete.generic", lang)

    if amt:
        return render("delete.amount", lang, label=label, amt=amt, date_part=date_part(dt_str, lang))
    return render("delete.label", lang, label=label, date_part=date_part(dt_str, lang))


def _compose_single_query(res: Dict[str, Any], lang: str) -> Tuple[str, str]:
    data = res.get("data") or {}
    q_kind = res.get("status") or data.get("query_kind") or res.get("action") or "list"
    if q_kind == "query":
        q_kind = res.get("status") or data.get("query_kind", "list")

    if q_kind == "budget":
        text = _compose_budget_query(data, lang)
        return text, text

    if q_kind == "balances":
        per_contact = data.get("balances") or data.get("per_contact") or []
        if not per_contact:
            side = data.get("balance_side") or "all"
            if side == "owed_to_me":
                empty_msg = render("balances.none_owed_to_me", lang)
            elif side == "i_owe":
                empty_msg = render("balances.none_i_owe", lang)
            else:
                empty_msg = render("balances.none", lang)
            return empty_msg, empty_msg

        sentences = []
        for c in per_contact:
            name = c.get("contact_name") or c.get("name")
            net = float(c.get("net_balance", 0))
            if net > 0:
                sentences.append(render("balances.owes_you", lang, name=name, amt=format_inr(net)))
            elif net < 0:
                sentences.append(render("balances.you_owe", lang, name=name, amt=format_inr(abs(net))))
            else:
                sentences.append(render("balances.settled", lang, name=name))

        full_text = " ".join(sentences)
        return full_text, full_text

    elif q_kind == "category_breakdown":
        cats = data.get("categories") or []
        filters = data.get("filters_used") or {}
        is_all_time = filters.get("is_all_time") or filters.get("period") == "all_time"
        if is_all_time:
            range_str = render("range.all_time", lang)
        else:
            range_str = format_range_from_dates(
                filters.get("resolved_date_from") or filters.get("date_from"),
                filters.get("resolved_date_to") or filters.get("date_to"),
                lang,
            )
        if not cats:
            msg = render("breakdown.none", lang, range=range_str)
            return msg, msg

        items = [f"{localize_category(c['category'], lang)} {format_inr(c['total'])}" for c in cats]
        full_reply = render("breakdown.full", lang, range=range_str, items=", ".join(items))
        spoken_reply = render("breakdown.spoken", lang, range=range_str, items=", ".join(items[:3]))
        return full_reply, spoken_reply

    elif q_kind == "sum":
        total_val = data.get("sum", data.get("total", 0))
        count_val = data.get("count", 0)
        filters = data.get("filters_used") or {}
        # If user queried for a specific amount/threshold and no match was found
        has_amt_filter = (
            filters.get("amount") is not None
            or filters.get("amount_min") is not None
            or filters.get("amount_max") is not None
        )
        if count_val == 0 and total_val == 0 and has_amt_filter:
            msg = _compose_resolver_none(filters, lang)
            return msg, msg

        total = format_inr(total_val)
        cat = localize_category(data.get("category") or filters.get("category"), lang)
        direction = filters.get("direction")
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
            lang,
        )
        if direction == "received":
            if cat:
                txt = render("sum.income_category", lang, cat=cat, total=total, range=range_str)
            elif range_str:
                txt = render("sum.income_range", lang, total=total, range=range_str)
            else:
                txt = render("sum.income_total", lang, total=total)
        else:
            if cat:
                txt = render("sum.spent_category", lang, cat=cat, total=total, range=range_str)
            elif range_str:
                txt = render("sum.spent_range", lang, total=total, range=range_str)
            else:
                txt = render("sum.total", lang, total=total)
        return txt, txt

    elif q_kind == "count":
        cnt = data.get("count", 0)
        filters = data.get("filters_used") or {}
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
            lang,
        )
        txt = render("count.one" if cnt == 1 else "count.many", lang, count=cnt, range=range_str)
        return txt, txt

    elif q_kind == "biggest":
        row = data.get("biggest") or data.get("transaction")
        filters = data.get("filters_used") or {}
        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
            lang,
        )
        if not row:
            msg = render("biggest.none", lang, range=range_str)
            return msg, msg
        amt = format_inr(row.get("amount", 0))
        cat = localize_category(row.get("category_name") or row.get("category") or "Food", lang)
        dt = format_date_short(row.get("txn_date"), lang)
        txt = render("biggest.found", lang, amt=amt, cat=cat, date_part=date_part(dt, lang))
        return txt, txt

    elif q_kind == "compare":
        # e.g. "This month ₹8,200, last month ₹6,900, up ₹1,300."
        p1_total = format_inr(data.get("sum_1", data.get("period1_total", 0)))
        p2_total = format_inr(data.get("sum_2", data.get("period2_total", 0)))
        diff = float(data.get("delta", data.get("difference", 0)))
        diff_str = format_inr(abs(diff))
        direction = render("compare.up" if diff >= 0 else "compare.down", lang)

        p1_lbl = _localize_period_label(data.get("period1_label", "This month"), lang)
        p2_lbl = _localize_period_label(data.get("period2_label", "last month"), lang)
        f1 = data.get("filters_used_1") or {}
        f2 = data.get("filters_used_2") or {}
        r1 = format_range_from_dates(f1.get("resolved_date_from"), f1.get("resolved_date_to"), lang)
        r2 = format_range_from_dates(f2.get("resolved_date_from"), f2.get("resolved_date_to"), lang)

        txt = render(
            "compare.result",
            lang,
            p1=p1_lbl,
            r1=r1,
            t1=p1_total,
            p2=p2_lbl,
            r2=r2,
            t2=p2_total,
            direction=direction,
            diff=diff_str,
        )
        return txt, txt

    elif q_kind == "list":
        rows = data.get("transactions") or []
        filters = data.get("filters_used") or {}
        if not rows:
            msg = _compose_resolver_none(filters, lang)
            return msg, msg

        range_str = format_range_from_dates(
            filters.get("resolved_date_from") or filters.get("date_from"),
            filters.get("resolved_date_to") or filters.get("date_to"),
            lang,
        )
        items = []
        for r in rows:
            amt = format_inr(r.get("amount", 0))
            cat = localize_category(r.get("category_name") or r.get("category") or "", lang)
            dt = format_date_short(r.get("txn_date"), lang)
            items.append(render("list.item", lang, amt=amt, cat=cat, date=dt).strip())

        full_reply = render("list.full", lang, count=len(rows), range=range_str, items=", ".join(items))
        # Spoken text speaks the top 3 only
        spoken_reply = render("list.spoken", lang, range=range_str, items=", ".join(items[:3]))
        return full_reply, spoken_reply

    done = render("query.done", lang)
    return done, done


def _budget_line(item: Dict[str, Any], lang: str) -> str:
    """One category's spent vs budget this month."""
    values = {
        "cat": localize_category(item.get("category"), lang),
        "spent": format_inr(item.get("spent", 0)),
        "budget": format_inr(item.get("budget", 0)),
    }
    if (item.get("over_by") or 0) > 0:
        return render("budget.over", lang, over=format_inr(item["over_by"]), **values)
    return render("budget.left", lang, left=format_inr(item.get("remaining", 0)), **values)


def _compose_budget_query(data: Dict[str, Any], lang: str) -> str:
    items = data.get("budgets") or []
    if not items:
        category = data.get("category")
        if category:
            return render("budget.none_for", lang, cat=localize_category(category, lang))
        return render("budget.none", lang)
    return " ".join(_budget_line(item, lang) for item in items)


def _compose_set_budget(res: Dict[str, Any], lang: str) -> str:
    data = res.get("data") or {}
    cat = localize_category(data.get("category"), lang)
    amt = format_inr(data.get("budget"))
    prev = data.get("previous_budget")
    if prev is not None and float(prev) != float(data.get("budget") or 0):
        return render("budget.changed", lang, cat=cat, amt_prev=format_inr(prev), amt=amt)
    return render("budget.set", lang, cat=cat, amt=amt)


def _budget_alerts(results: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Budget alerts on successful adds and edits (see services/budgets.py), one per category:
    when one plan crosses 80% and then 100%, only the 100% alert is kept.
    """
    by_category: Dict[str, Dict[str, Any]] = {}
    for r in results or []:
        if not r.get("ok") or r.get("action") not in ("add", "edit"):
            continue
        alert = (r.get("data") or {}).get("budget_alert")
        if not alert:
            continue
        category = alert.get("category")
        if category not in by_category or alert.get("alert") == "over":
            by_category[category] = alert
    return list(by_category.values())


def budget_alert_mood(results: Optional[List[Dict[str, Any]]]) -> Optional[str]:
    """'concerned' when results crossed 100% of a budget, else None (80% keeps the usual mood)."""
    return "concerned" if any(a.get("alert") == "over" for a in _budget_alerts(results)) else None


def budget_alert_lines(results: Optional[List[Dict[str, Any]]], lang: str) -> List[str]:
    """One alert line per category whose budget threshold the results crossed."""
    lines = []
    for alert in _budget_alerts(results):
        values = {"cat": localize_category(alert.get("category"), lang), "budget": format_inr(alert.get("budget"))}
        if alert.get("alert") == "over":
            lines.append(render("budget.alert_over", lang, spent=format_inr(alert.get("spent")), **values))
        else:
            lines.append(render("budget.alert_near", lang, pct=alert.get("percent"), **values))
    return lines


BUDGET_CATEGORY_ERRORS = ("budget_missing_category", "budget_invalid_category")


def _compose_budget_category_error(res: Dict[str, Any], lang: str) -> str:
    if (res.get("status") or res.get("error")) == "budget_missing_category":
        return render("budget.missing_category", lang)
    names = [localize_category(c, lang) for c in (res.get("data") or {}).get("categories") or []]
    if lang == "ml" or len(names) < 2:
        cats = ", ".join(names)
    else:
        cats = ", ".join(names[:-1]) + " and " + names[-1]
    return render("budget.invalid_category", lang, cats=cats)


def _compose_single_undo(res: Dict[str, Any], lang: str) -> str:
    if res.get("ok"):
        return render("undo.done", lang)
    return render("undo.nothing", lang)


def _compose_resolver_none(filters: Optional[Dict[str, Any]], lang: str) -> str:
    lang = lang if lang in REPLY_LANGUAGES else "en"
    if not filters:
        return render("none.generic", lang)

    unknown_c = filters.get("unknown_contact")
    if unknown_c:
        return render("none.unknown_contact", lang, name=unknown_c)

    # Edge case: "it" or "last_touched" with no previous transaction
    if filters.get("ref") == "last_touched":
        return render("none.last_touched", lang)

    cat = filters.get("category")
    amt = filters.get("amount")
    contact = filters.get("contact")
    direction = filters.get("direction")
    is_income = direction == "received" or filters.get("type") == "income"
    is_all_time = filters.get("is_all_time") or filters.get("period") == "all_time"

    if is_all_time:
        range_str = render("range.all_time", lang)
    else:
        d_from = filters.get("resolved_date_from") or filters.get("date_from") or filters.get("date")
        d_to = filters.get("resolved_date_to") or filters.get("date_to") or filters.get("date")
        range_str = format_range_from_dates(d_from, d_to, lang)

    type_word = render("word.income" if is_income else "word.expense", lang)

    if cat:
        noun = f"{localize_category(cat, lang)} {type_word}"
    elif contact:
        noun = render("none.contact_transaction", lang, contact=contact)
    elif amt is not None:
        noun = type_word
    else:
        noun = render("word.transactions", lang)

    if lang == "ml":
        # Malayalam qualifiers come before the noun: contact, then amount.
        parts = []
        if cat and contact:
            parts.append(render("none.with_contact", lang, contact=contact))
        if amt is not None:
            parts.append(format_inr(amt))
        parts.append(noun)
    else:
        parts = [noun]
        if amt is not None:
            parts.append(f"of {format_inr(amt)}")
        if cat and contact:
            parts.append(render("none.with_contact", lang, contact=contact))

    desc = " ".join(parts)

    if range_str:
        return render("none.range", lang, desc=desc, range=range_str)

    if not cat and not contact and amt is None:
        return render("none.no_transactions", lang)
    return render("none.desc", lang, desc=desc)


def _clarify_template_key(missing_fields: Optional[List[str]]) -> str:
    for field in missing_fields or []:
        f = str(field).strip().lower()
        if f == "amount":
            return "clarify.amount"
        if f == "date":
            return "clarify.date"
        if f in ("contact", "contact_name", "person", "name"):
            return "clarify.contact"
        if f == "category":
            return "clarify.category"
    return "clarify.generic"


def compose_reply(
    plan: Optional[Plan],
    results: List[Dict[str, Any]],
    pending: Optional[PendingSummary] = None,
    language: str = "en",
    filters_used: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str]:
    """
    Main composer function. Returns (reply_text, spoken_text).
    language is the resolved reply language ('en' or 'ml'); anything else composes English.
    Guarantees deterministic, beautifully phrased template output.
    """
    lang = (language or "en").lower()
    if lang not in REPLY_LANGUAGES:
        lang = "en"

    reply_text, spoken_text = _compose(plan, results, pending, lang, filters_used)
    return reply_text, to_spoken(spoken_text, lang)


def _compose(
    plan: Optional[Plan],
    results: List[Dict[str, Any]],
    pending: Optional[PendingSummary],
    lang: str,
    filters_used: Optional[Dict[str, Any]],
) -> Tuple[str, str]:
    # 1. Active Pending Item takes precedence for question asking
    if pending:
        if pending.kind == "confirm":
            q = pending.question
            return q, q
        elif pending.kind == "disambiguate":
            candidates = pending.candidates or []
            if candidates:
                cand_strs = []
                for idx, c in enumerate(candidates, 1):
                    amt = format_inr(c.get("amount", 0))
                    cat = localize_category(c.get("category_name") or c.get("category") or "", lang)
                    dt = format_date_short(c.get("date") or c.get("txn_date"), lang)
                    cand_strs.append(render("pending.candidate", lang, idx=idx, cat=cat, amt=amt, date=dt).strip())
                which_one = render("pending.which_one", lang)
                reply = f"{which_one} " + ", ".join(cand_strs)
                # Spoken text speaks options concisely
                spoken = f"{which_one} " + ", ".join(cand_strs[:3])
                return reply, spoken
            return pending.question, pending.question
        elif pending.kind == "contact_confirm":
            return pending.question, pending.question

    # 2. Check for Plan-level Clarify or Chat
    if plan and plan.actions:
        first_act = plan.actions[0]
        if first_act.op == "clarify":
            if lang == "ml":
                q = render(_clarify_template_key(first_act.missing_fields), lang)
            else:
                q = first_act.question or render("clarify.generic", lang)
            return q, q

        elif first_act.op == "chat":
            kind = first_act.kind
            if kind in ("greeting", "help", "off_topic", "unsupported", "unsupported_bulk"):
                msg = render(f"chat.{kind}", lang)
                return msg, msg

    # 3. Process Execution Results
    if not results:
        # Check if resolver found nothing
        msg = _compose_resolver_none(filters_used, lang)
        return msg, msg

    success_sentences: List[str] = []
    failure_sentences: List[str] = []
    spoken_sentences: List[str] = []

    for r in results:
        ok = r.get("ok", False)
        act = r.get("action", "")

        if ok:
            if act == "add":
                sent = _compose_single_add(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act == "edit":
                sent = _compose_single_edit(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act == "delete":
                sent = _compose_single_delete(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act in ("query", "balances", "sum", "count", "biggest", "compare", "list"):
                full_s, spk_s = _compose_single_query(r, lang)
                success_sentences.append(full_s)
                spoken_sentences.append(spk_s)
            elif act == "undo":
                sent = _compose_single_undo(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            elif act == "set_budget":
                sent = _compose_set_budget(r, lang)
                success_sentences.append(sent)
                spoken_sentences.append(sent)
            else:
                done = render("op.done", lang)
                success_sentences.append(done)
                spoken_sentences.append(done)
        else:
            err = r.get("error") or "Failed to process"
            filters = r.get("filters_used") or filters_used
            if (r.get("status") or err) in BUDGET_CATEGORY_ERRORS:
                failure_sentences.append(_compose_budget_category_error(r, lang))
            elif (filters and filters.get("unknown_contact")) or "unknown contact" in err.lower():
                sent = _compose_resolver_none(filters, lang)
                failure_sentences.append(sent)
            elif "not found" in err.lower():
                sent = _compose_resolver_none(filters, lang)
                failure_sentences.append(sent)
            elif "disambiguation" in err.lower():
                failure_sentences.append(render("error.multiple_matches", lang))
            elif "nothing is waiting for confirmation" in err.lower() or r.get("action") == "answer_pending":
                failure_sentences.append(render("error.nothing_pending", lang))
            else:
                target = r.get("action", "transaction")
                failure_sentences.append(render("error.generic", lang, target=target, err=err))

    joiner = _SENTENCE_JOINER[lang]

    # Combine multi-action sentences
    full_parts = []
    if success_sentences:
        if len(success_sentences) == 1:
            full_parts.append(success_sentences[0])
        else:
            combined = joiner.join(s.rstrip(".") for s in success_sentences) + "."
            full_parts.append(combined)
    if failure_sentences:
        full_parts.append(" ".join(failure_sentences))

    reply_text = " ".join(full_parts) if full_parts else render("done", lang)

    spoken_parts = []
    if spoken_sentences:
        if len(spoken_sentences) == 1:
            spoken_parts.append(spoken_sentences[0])
        else:
            combined_spk = joiner.join(s.rstrip(".") for s in spoken_sentences) + "."
            spoken_parts.append(combined_spk)
    if failure_sentences:
        spoken_parts.append(" ".join(failure_sentences))

    spoken_text = " ".join(spoken_parts) if spoken_parts else render("done", lang)

    alerts = budget_alert_lines(results, lang)
    if alerts:
        reply_text = " ".join([reply_text, *alerts])
        spoken_text = " ".join([spoken_text, *alerts])

    return reply_text, spoken_text


def derive_mood(
    results: Optional[List[Dict[str, Any]]] = None,
    plan: Optional[Any] = None,
    pending: Optional[Any] = None,
) -> Literal["neutral", "happy", "excited", "concerned", "confused"]:
    """
    Derives Pappu mascot mood from result kinds and pending kind only.
    - Pending kinds confirm, contact_confirm and disambiguation give concerned
    - Expense added is happy
    - Income added is excited
    - Unsupported or clarify is confused
    - Everything else is neutral
    """
    # 1. Unsupported or Clarify -> confused
    if plan and getattr(plan, "actions", None):
        for act in plan.actions:
            if getattr(act, "op", None) == "clarify":
                return "confused"
            if getattr(act, "op", None) == "chat" and getattr(act, "kind", None) in ("unsupported", "unsupported_bulk"):
                return "confused"

    if results:
        for r in results:
            err = str(r.get("error") or "").lower()
            if "unsupported" in err or "budget" in err or "clarify" in err:
                return "confused"
            if r.get("action") == "clarify":
                return "confused"

    # 2. Pending kinds confirm, contact_confirm, and disambiguation -> concerned
    if pending:
        p_kind = getattr(pending, "kind", None) or (pending.get("kind") if isinstance(pending, dict) else None)
        if p_kind:
            p_kind_str = str(p_kind).strip().lower()
            if p_kind_str in ("confirm", "contact_confirm", "disambiguation", "disambiguate"):
                return "concerned"

    if results:
        for r in results:
            if r.get("status") in ("needs_confirmation", "contact_confirm") or r.get("needs_confirmation"):
                return "concerned"

    # Crossing 100% of a budget -> concerned (crossing 80% keeps the usual add mood)
    if budget_alert_mood(results):
        return "concerned"

    # 3. Income added -> excited
    # 4. Expense added -> happy
    if results:
        for r in results:
            if r.get("ok") and r.get("action") == "add":
                data = r.get("data") or {}
                t_type = str(data.get("type") or r.get("type") or "").lower()
                if t_type == "income":
                    return "excited"
                elif t_type in ("expense", "sent"):
                    return "happy"
                direction = str(data.get("direction") or r.get("direction") or "").lower()
                if direction == "received":
                    return "excited"
                elif direction == "sent":
                    return "happy"
                return "happy"

    return "neutral"
