from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import text
from app.config import DATABASE_URL

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def check_db_connection() -> bool:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False

def init_db(bind_engine=None):
    """
    Initializes database schema and seeds required fixed seed data.
    """
    import app.models  # Ensure models are imported and registered with Base
    from app.services.category_seed import seed_categories

    target_engine = bind_engine or engine
    Base.metadata.create_all(bind=target_engine)

    Session = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)
    db = Session()
    try:
        seed_categories(db)
    finally:
        db.close()
