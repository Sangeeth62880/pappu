"""
One time cleanup script for duplicate chat_messages rows.
Identifies duplicate consecutive messages with identical user_id, role, text
created within 120 seconds of each other (caused by frontend saving alongside backend).

Usage:
  python scripts/clean_duplicate_chat_messages.py --dry-run
  python scripts/clean_duplicate_chat_messages.py --delete
"""

import sys
import argparse
from typing import List, Tuple
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL
from app.models.chat_message import ChatMessage


def find_duplicate_message_ids(session) -> List[Tuple[str, str, str, str]]:
    """
    Finds duplicate chat messages per user ordered by created_at.
    Returns list of (duplicate_id, user_id, role, text).
    """
    all_msgs = (
        session.query(ChatMessage)
        .order_by(ChatMessage.user_id, ChatMessage.created_at.asc(), ChatMessage.id.asc())
        .all()
    )

    duplicates: List[Tuple[str, str, str, str]] = []
    prev_msg = None

    for msg in all_msgs:
        if prev_msg is not None:
            same_user = prev_msg.user_id == msg.user_id
            same_role = prev_msg.role == msg.role
            same_text = (prev_msg.text or "").strip() == (msg.text or "").strip()
            
            time_diff = 0
            if prev_msg.created_at and msg.created_at:
                time_diff = abs((msg.created_at - prev_msg.created_at).total_seconds())

            if same_user and same_role and same_text and time_diff <= 120:
                duplicates.append((str(msg.id), str(msg.user_id), msg.role, msg.text))
                # Do not advance prev_msg so triplet/quad duplicates are also caught
                continue

        prev_msg = msg

    return duplicates


def main():
    parser = argparse.ArgumentParser(description="Clean duplicate chat messages.")
    parser.add_argument(
        "--delete",
        action="store_true",
        help="Actually delete duplicate rows. Default is dry-run.",
    )
    args = parser.parse_args()

    if not DATABASE_URL:
        print("DATABASE_URL is not set.")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        duplicates = find_duplicate_message_ids(session)
        print(f"Total duplicate chat_messages rows found: {len(duplicates)}")
        
        for dup_id, u_id, role, text in duplicates[:20]:
            snippet = (text or "")[:40].replace("\n", " ")
            print(f"  Duplicate id={dup_id} user={u_id} role={role} text='{snippet}'")
        if len(duplicates) > 20:
            print(f"  ... and {len(duplicates) - 20} more duplicates.")

        if args.delete:
            if not duplicates:
                print("No duplicate rows to delete.")
                return

            dup_ids = [d[0] for d in duplicates]
            deleted_count = (
                session.query(ChatMessage)
                .filter(ChatMessage.id.in_(dup_ids))
                .delete(synchronize_session=False)
            )
            session.commit()
            print(f"Successfully deleted {deleted_count} duplicate rows.")
        else:
            print("\nDRY RUN mode. No data was deleted. Run with --delete after approval.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
