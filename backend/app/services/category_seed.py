from sqlalchemy.orm import Session
from app.models.category import Category

SEED_CATEGORIES = [
    {"name": "Food", "type": "expense"},
    {"name": "Transport", "type": "expense"},
    {"name": "Shopping", "type": "expense"},
    {"name": "Bills", "type": "expense"},
    {"name": "Entertainment", "type": "expense"},
    {"name": "Salary", "type": "income"},
    {"name": "Other", "type": "expense"},
]

def seed_categories(db: Session) -> list[Category]:
    """
    Seeds the fixed list of categories if they do not already exist.
    Categories are a fixed, seeded list per PROJECT_SPEC.md §4 and CLAUDE.md.
    """
    seeded = []
    for cat_data in SEED_CATEGORIES:
        category = db.query(Category).filter(Category.name == cat_data["name"]).first()
        if not category:
            category = Category(name=cat_data["name"], type=cat_data["type"])
            db.add(category)
        seeded.append(category)
    db.commit()
    return seeded
