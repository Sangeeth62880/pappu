"""
Contact matcher service for Pappu.
Detects exact matches, fuzzy matches, and substring matches for person names.
Prevents unintended duplicate contacts by suggesting similar existing contacts.
"""

import uuid
import difflib
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from app.models.contact import Contact


def find_similar_contacts(
    db: Session,
    user_id: uuid.UUID,
    input_name: str,
    similarity_threshold: float = 0.65,
) -> Tuple[Optional[Contact], List[Contact]]:
    """
    Search contacts belonging to `user_id` for exact or similar matches to `input_name`.

    Returns:
        (exact_match, similar_contacts_list)
        - exact_match: Contact if an exact case-insensitive match exists, else None.
        - similar_contacts_list: List of existing contacts that are similar (substring or fuzzy).
    """
    if not input_name or not input_name.strip():
        return None, []

    clean_name = input_name.strip()
    clean_lower = clean_name.lower()

    # Fetch all contacts for this user
    user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
    if not user_contacts:
        return None, []

    exact_match = None
    similar_contacts = []

    for contact in user_contacts:
        c_name = contact.name.strip()
        c_lower = c_name.lower()

        # 1. Exact match (case-insensitive)
        if c_lower == clean_lower:
            exact_match = contact
            continue

        # 2. Substring / Word match (e.g. "Arjun" in "Arjun Nair", or "Arjun Nair" contains "Arjun")
        words_in_contact = c_lower.split()
        if clean_lower in words_in_contact or clean_lower in c_lower or c_lower in clean_lower:
            similar_contacts.append(contact)
            continue

        # 3. Fuzzy similarity (Levenshtein ratio)
        ratio = difflib.SequenceMatcher(None, clean_lower, c_lower).ratio()
        if ratio >= similarity_threshold:
            similar_contacts.append(contact)

    return exact_match, similar_contacts
