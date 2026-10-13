from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import text
from app.config import DATABASE_URL

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
)
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

def get_db():
    """
    FastAPI dependency that yields a SQLAlchemy database session and closes it afterwards.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db(bind_engine=None):
    """
    Initializes database schema, applies PostgreSQL RLS policies where supported,
    and seeds required fixed category seed data.
    """
    import app.models  # Ensure models are imported and registered with Base
    from app.services.category_seed import seed_categories

    target_engine = bind_engine or engine
    Base.metadata.create_all(bind=target_engine)

    # Enable Row-Level Security (RLS) on PostgreSQL if supported
    if target_engine.dialect.name == "postgresql":
        try:
            with target_engine.connect() as connection:
                connection.execute(text("""
                    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
                    DROP POLICY IF EXISTS "Users can manage their own profile" ON profiles;
                    CREATE POLICY "Users can manage their own profile" ON profiles
                        FOR ALL
                        USING (id = auth.uid())
                        WITH CHECK (id = auth.uid());

                    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
                    DROP POLICY IF EXISTS "Users can manage their own transactions" ON transactions;
                    CREATE POLICY "Users can manage their own transactions" ON transactions
                        FOR ALL
                        USING (user_id = auth.uid())
                        WITH CHECK (user_id = auth.uid());

                    ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
                    DROP POLICY IF EXISTS "Users can manage their own chat messages" ON chat_messages;
                    CREATE POLICY "Users can manage their own chat messages" ON chat_messages
                        FOR ALL
                        USING (user_id = auth.uid())
                        WITH CHECK (user_id = auth.uid());
                """))
                connection.commit()
        except Exception as e:
            # Policies or permissions may already be managed at Supabase project level
            pass

    Session = sessionmaker(autocommit=False, autoflush=False, bind=target_engine)
    db = Session()
    try:
        seed_categories(db)
    finally:
        db.close()
