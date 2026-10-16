"""
Bilingual spoken response generator for Pappu.
Generates concise, natural spoken responses matching the user's input language (English / Malayalam / code-mixed).
"""

from typing import Optional, Dict, Any


def generate_spoken_response(
    decision: str,
    action: str,
    language: str = "en",
    fields: Optional[Dict[str, Any]] = None,
    execution_result: Optional[Dict[str, Any]] = None,
    matched_count: int = 0,
    target_transaction: Optional[Dict[str, Any]] = None,
    reasoning: Optional[str] = None,
) -> str:
    """
    Generate a spoken natural response sentence matching the user's input language.

    Args:
        decision: One of 'EXECUTE', 'ASK_CONFIRMATION', 'ASK_DISAMBIGUATION', 'ASK_CLARIFICATION'
        action: 'add', 'edit', 'delete', 'query'
        language: 'en', 'ml', 'mixed'
        fields: Intent fields extracted
        execution_result: Backend DB execution output
        matched_count: Number of matched transactions
        target_transaction: Transaction details for confirmation/edit
        reasoning: Self-verification interpretation from LLM
    """
    fields = fields or {}
    amount = fields.get("amount")
    category = fields.get("category") or "expense"
    formatted_amount = f"₹{amount}" if amount is not None else ""

    lang = (language or "en").lower()

    if decision == "EXECUTE":
        if action == "add":
            if lang == "ml":
                return f"{category} ഇനത്തിൽ {formatted_amount} വിജയകരമായി ചേർത്തു."
            elif lang == "mixed":
                return f"{category}-ലേക്ക് {formatted_amount} add ചെയ്തിട്ടുണ്ട്."
            else:
                return f"Added {category} transaction for {formatted_amount}."
        elif action == "query":
            if lang == "ml":
                return "വിവരങ്ങൾ ശേഖരിക്കുന്നു. വിശദാംശങ്ങൾ ചാറ്റിൽ കാണാം."
            elif lang == "mixed":
                return "Data fetch ചെയ്യുന്നുണ്ട്. Details chat-il kaanam."
            else:
                return "Fetching your data. Details are displayed below."
        elif action in ("edit", "delete"):
            if lang == "ml":
                return f"ഇടപാട് വിജയകരമായി { 'തിരുത്തി' if action == 'edit' else 'ഡിലീറ്റ് ചെയ്തു'}."
            elif lang == "mixed":
                return f"Transaction successfully {action} ചെയ്തു."
            else:
                return f"Successfully {action}ed the transaction."

    elif decision == "ASK_CONFIRMATION":
        target = target_transaction or {}
        target_amt = target.get("amount", amount)
        target_cat = target.get("category_name") or target.get("category", category)
        prefix = f"{reasoning}. " if reasoning else ""
        if lang == "ml":
            return f"{prefix}{target_cat} ഇനത്തിലുള്ള ₹{target_amt} ൻ്റെ ഇടപാട് { 'തിരുത്തണോ' if action == 'edit' else 'ഡിലീറ്റ് ചെയ്യണോ'}? ഉറപ്പാക്കുക."
        elif lang == "mixed":
            return f"{prefix}{target_cat} transaction ₹{target_amt} {action} ചെയ്യണമെന്ന് ഉറപ്പാണോ?"
        else:
            return f"{prefix}Are you sure you want to {action} the {target_cat} transaction of ₹{target_amt}?"

    elif decision == "ASK_DISAMBIGUATION":
        if lang == "ml":
            return f"{matched_count} സമാനമായ ഇടപാടുകൾ കണ്ടെത്തി. ഏതാണ് മാറ്റേണ്ടതെന്ന് തിരഞ്ഞെടുക്കുക."
        elif lang == "mixed":
            return f"{matched_count} matching transactions ഉണ്ട്. ഏതാണ് വേണ്ടതെന്ന് select ചെയ്യുക."
        else:
            return f"Multiple transactions match. Please select which one you want to {action}."

    elif decision == "ASK_CLARIFICATION":
        if lang == "ml":
            return "ദയവായി തുകയോ കാറ്റഗറിയോ കൃത്യമായി വ്യക്തമാക്കുക."
        elif lang == "mixed":
            return "Please amount or category വ്യക്തമാക്കുക."
        else:
            return "Please specify the amount or category for this transaction."

    # Default fallback
    return "Done!" if lang == "en" else "പൂർത്തിയായി!"
