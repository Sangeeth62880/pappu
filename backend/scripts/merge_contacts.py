"""
Contact Merge Utility for Pappu Assistant.
Allows inspecting contacts and merging secondary contact into primary contact.
Moves all transactions, merges aliases, and removes secondary contact.
"""

import sys
import uuid
import argparse
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.assistant.contacts import normalize_name, merge_contacts


def inspect_contacts(db: Session, user_id: uuid.UUID):
    print(f"Inspecting contacts for user {user_id}:")
    contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
    if not contacts:
        print("No contacts found.")
        return

    print("-" * 70)
    for c in contacts:
        txns = (
            db.query(Transaction)
            .filter(Transaction.contact_id == c.id, Transaction.user_id == user_id)
            .all()
        )
        sent = sum((t.amount for t in txns if t.type == "expense"), 0)
        received = sum((t.amount for t in txns if t.type == "income"), 0)
        net = sent - received
        print(f"ID: {c.id}")
        print(f"Name: {c.name}")
        print(f"Aliases: {c.aliases or []}")
        print(f"Transactions: {len(txns)} (Sent: {sent}, Received: {received}, Net: {net})")
        print("-" * 70)


def preview_merge(db: Session, user_id: uuid.UUID, primary_id: uuid.UUID, secondary_id: uuid.UUID):
    primary = (
        db.query(Contact)
        .filter(Contact.id == primary_id, Contact.user_id == user_id)
        .first()
    )
    secondary = (
        db.query(Contact)
        .filter(Contact.id == secondary_id, Contact.user_id == user_id)
        .first()
    )

    if not primary:
        print(f"Error: Primary contact {primary_id} not found.")
        sys.exit(1)
    if not secondary:
        print(f"Error: Secondary contact {secondary_id} not found.")
        sys.exit(1)

    txns = (
        db.query(Transaction)
        .filter(Transaction.contact_id == secondary.id, Transaction.user_id == user_id)
        .all()
    )

    existing_aliases = set(normalize_name(a).lower() for a in (primary.aliases or []))
    existing_aliases.add(normalize_name(primary.name).lower())

    planned_aliases = list(primary.aliases or [])
    sec_name = normalize_name(secondary.name)
    if sec_name and sec_name.lower() not in existing_aliases:
        planned_aliases.append(sec_name)
        existing_aliases.add(sec_name.lower())

    for a in (secondary.aliases or []):
        norm_a = normalize_name(str(a))
        if norm_a and norm_a.lower() not in existing_aliases:
            planned_aliases.append(norm_a)
            existing_aliases.add(norm_a.lower())

    print("PROPOSED MERGE PREVIEW:")
    print(f"Target Primary Contact: {primary.name} ({primary.id})")
    print(f"Source Secondary Contact to Delete: {secondary.name} ({secondary.id})")
    print(f"Transactions to reassign: {len(txns)}")
    print(f"Resulting Aliases for {primary.name}: {planned_aliases}")


def main():
    parser = argparse.ArgumentParser(description="Merge secondary contact into primary contact.")
    parser.add_argument("--user-id", type=str, default="fae48b6e-e7dd-4504-a1f7-12dab405ea1f", help="User UUID")
    parser.add_argument("--inspect", action="store_true", help="Inspect contacts for user")
    parser.add_argument("--primary-id", type=str, help="Primary contact UUID to keep")
    parser.add_argument("--secondary-id", type=str, help="Secondary contact UUID to merge and delete")
    parser.add_argument("--execute", action="store_true", help="Execute merge (modifies database)")

    args = parser.parse_args()
    user_id = uuid.UUID(args.user_id)
    db = SessionLocal()

    try:
        if args.inspect:
            inspect_contacts(db, user_id)
            return

        if not args.primary_id or not args.secondary_id:
            print("Error: Both --primary-id and --secondary-id are required for merging.")
            sys.exit(1)

        primary_id = uuid.UUID(args.primary_id)
        secondary_id = uuid.UUID(args.secondary_id)

        if not args.execute:
            print("DRY RUN MODE (pass --execute to apply changes to database):")
            preview_merge(db, user_id, primary_id, secondary_id)
        else:
            print("EXECUTING MERGE...")
            res = merge_contacts(db, user_id, primary_id, secondary_id)
            print(f"Merge successful: {res}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
