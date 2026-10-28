"""
Deterministic Contact Resolution Service for Pappu Assistant v2.

Resolves person names in strict priority order:
1. Exact match on name or alias (case-insensitive, Unicode NFC normalized).
2. Fuzzy similarity at the existing 0.65 threshold (does not auto-merge).
3. New contact creation.

No transliteration code is used.
"""

import uuid
import difflib
import unicodedata
from dataclasses import dataclass
from typing import Optional, List, Literal, Dict, Any
from sqlalchemy.orm import Session

from app.models.contact import Contact
from app.models.transaction import Transaction
from app.services.contact_matcher import find_similar_contacts

SIMILARITY_THRESHOLD = 0.65


MALAYALAM_CASE_SUFFIXES: List[str] = [
    "യോട്", "ോട്",
    "യുടെ", "ുടെ", "ിന്റെ", "ന്റെ",
    "യ്ക്ക്", "ക്ക്",
    "ിനെ", "നെ",
    "ിന്", "ന്",
]


def get_malayalam_name_stems(name: str) -> List[str]:
    """
    Generates candidate uninflected Malayalam name stems by stripping
    common case suffixes. Handles chillu consonant letters.
    """
    norm = normalize_name(name)
    if not norm:
        return []

    stems: List[str] = []
    for s in MALAYALAM_CASE_SUFFIXES:
        if norm.endswith(s):
            stem = norm[:-len(s)]
            if stem:
                stems.append(stem)
                if stem.endswith("ല"):
                    stems.append(stem[:-1] + "ൽ")
                elif stem.endswith("ണ"):
                    stems.append(stem[:-1] + "ൺ")
                elif stem.endswith("ന"):
                    stems.append(stem[:-1] + "ൻ")
                elif stem.endswith("ര"):
                    stems.append(stem[:-1] + "ർ")

    return list(dict.fromkeys(stems))


def normalize_name(text: Optional[str]) -> str:
    """
    Normalizes a name string using Unicode NFC and strips leading or trailing whitespace.
    """
    if not text:
        return ""
    return unicodedata.normalize("NFC", text).strip()


@dataclass
class ContactResolution:
    """
    Result of attempting to resolve a spoken or written contact name.
    """
    status: Literal["exact", "fuzzy", "new"]
    contact: Optional[Contact] = None
    candidate: Optional[Contact] = None
    candidate_name: Optional[str] = None
    spoken_name: str = ""
    similarity: float = 0.0


def resolve_contact(
    db: Session,
    user_id: uuid.UUID,
    input_name: str,
    threshold: float = SIMILARITY_THRESHOLD,
) -> ContactResolution:
    """
    Resolves a contact name for user_id in strict priority order:
    1. Exact match on name or any alias (case-insensitive, Unicode normalized).
    2. Uninflected Malayalam stem match on name or any alias.
    3. Fuzzy match at threshold (0.65). Returns candidate without auto-merging.
    4. New contact if no exact, stem, or fuzzy match exists.
    """
    clean_name = normalize_name(input_name)
    if not clean_name:
        return ContactResolution(status="new", spoken_name="")

    clean_lower = clean_name.lower()

    # Fetch all contacts for this user
    user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
    if not user_contacts:
        return ContactResolution(status="new", spoken_name=clean_name)

    # 1. Exact match on contact.name or contact.aliases (Unicode normalized, case-insensitive)
    for c in user_contacts:
        c_name = normalize_name(c.name)
        if c_name.lower() == clean_lower:
            return ContactResolution(status="exact", contact=c, spoken_name=clean_name)

        for alias in (c.aliases or []):
            a_norm = normalize_name(str(alias))
            if a_norm.lower() == clean_lower:
                return ContactResolution(status="exact", contact=c, spoken_name=clean_name)

    # 2. Match uninflected Malayalam case stems on contact.name or contact.aliases
    stems = get_malayalam_name_stems(clean_name)
    for stem in stems:
        stem_lower = stem.lower()
        for c in user_contacts:
            c_name = normalize_name(c.name)
            if c_name.lower() == stem_lower:
                return ContactResolution(status="exact", contact=c, spoken_name=clean_name)

            for alias in (c.aliases or []):
                a_norm = normalize_name(str(alias))
                if a_norm.lower() == stem_lower:
                    return ContactResolution(status="exact", contact=c, spoken_name=clean_name)

    # 2. Fuzzy match check using the existing helper and alias ratio comparison
    # First invoke find_similar_contacts from the existing service
    _, similar_contacts = find_similar_contacts(
        db,
        user_id,
        clean_name,
        similarity_threshold=threshold,
    )

    best_candidate: Optional[Contact] = None
    best_ratio: float = 0.0

    if similar_contacts:
        for c in similar_contacts:
            c_name = normalize_name(c.name).lower()
            ratio = difflib.SequenceMatcher(None, clean_lower, c_name).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_candidate = c

    # Also check fuzzy match against aliases
    for c in user_contacts:
        for alias in (c.aliases or []):
            a_lower = normalize_name(str(alias)).lower()
            ratio = difflib.SequenceMatcher(None, clean_lower, a_lower).ratio()
            if ratio >= threshold and ratio > best_ratio:
                best_ratio = ratio
                best_candidate = c

    if best_candidate and best_ratio >= threshold:
        return ContactResolution(
            status="fuzzy",
            candidate=best_candidate,
            candidate_name=best_candidate.name,
            spoken_name=clean_name,
            similarity=best_ratio,
        )

    # 3. Neither exact nor fuzzy: create new
    return ContactResolution(status="new", spoken_name=clean_name)


def create_contact(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    aliases: Optional[List[str]] = None,
) -> Contact:
    """
    Creates a new contact record for user_id.
    """
    clean_name = normalize_name(name)
    clean_aliases = [normalize_name(a) for a in (aliases or []) if normalize_name(a)]

    contact = Contact(
        id=uuid.uuid4(),
        user_id=user_id,
        name=clean_name,
        aliases=clean_aliases,
    )
    db.add(contact)
    db.flush()
    return contact


def add_alias_to_contact(
    db: Session,
    contact_id: uuid.UUID,
    user_id: uuid.UUID,
    alias: str,
) -> Optional[Contact]:
    """
    Adds a new spoken alias to an existing contact.
    Verifies user_id isolation before updating.
    """
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.user_id == user_id)
        .first()
    )
    if not contact:
        return None

    clean_alias = normalize_name(alias)
    if not clean_alias:
        return contact

    existing_aliases = [normalize_name(str(a)) for a in (contact.aliases or [])]
    existing_lower = {a.lower() for a in existing_aliases}
    existing_lower.add(normalize_name(contact.name).lower())

    if clean_alias.lower() not in existing_lower:
        # Re-assign list to ensure SQLAlchemy detects change on both SQLite and Postgres
        contact.aliases = list(contact.aliases or []) + [clean_alias]
        db.flush()

    return contact


def merge_contacts(
    db: Session,
    user_id: uuid.UUID,
    primary_id: uuid.UUID,
    secondary_id: uuid.UUID,
) -> Dict[str, Any]:
    """
    Merges contact B (secondary) into contact A (primary) for user_id:
    1. Validates both contacts belong to user_id.
    2. Moves all transactions referencing secondary_id to primary_id.
    3. Adds secondary name and aliases to primary aliases avoiding duplicates.
    4. Deletes secondary contact.
    5. Returns summary of merged contact.
    """
    if primary_id == secondary_id:
        raise ValueError("Cannot merge a contact into itself.")

    primary = (
        db.query(Contact)
        .filter(Contact.id == primary_id, Contact.user_id == user_id)
        .first()
    )
    if not primary:
        raise ValueError("Primary contact not found.")

    secondary = (
        db.query(Contact)
        .filter(Contact.id == secondary_id, Contact.user_id == user_id)
        .first()
    )
    if not secondary:
        raise ValueError("Secondary contact not found.")

    # 1. Move transactions referencing secondary to primary
    txns = (
        db.query(Transaction)
        .filter(Transaction.contact_id == secondary.id, Transaction.user_id == user_id)
        .all()
    )
    for t in txns:
        t.contact_id = primary.id
    db.flush()
    secondary.transactions = []

    # 2. Collect existing primary identifiers
    existing_aliases = set(normalize_name(a).lower() for a in (primary.aliases or []))
    existing_aliases.add(normalize_name(primary.name).lower())

    new_aliases = list(primary.aliases or [])

    # Add secondary name as alias
    sec_name = normalize_name(secondary.name)
    if sec_name and sec_name.lower() not in existing_aliases:
        new_aliases.append(sec_name)
        existing_aliases.add(sec_name.lower())

    # Add secondary existing aliases
    for alias in (secondary.aliases or []):
        norm_a = normalize_name(str(alias))
        if norm_a and norm_a.lower() not in existing_aliases:
            new_aliases.append(norm_a)
            existing_aliases.add(norm_a.lower())

    primary.aliases = new_aliases

    # Preserve phone and upi_id if primary doesn't have them
    if not primary.phone and secondary.phone:
        primary.phone = secondary.phone
    if not primary.upi_id and secondary.upi_id:
        primary.upi_id = secondary.upi_id

    # 3. Delete secondary contact
    db.delete(secondary)
    db.commit()
    db.refresh(primary)

    return {
        "primary_id": str(primary.id),
        "primary_name": primary.name,
        "secondary_id": str(secondary_id),
        "secondary_name": secondary.name,
        "transactions_moved": len(txns),
        "aliases": primary.aliases,
    }

