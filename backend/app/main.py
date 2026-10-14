import anyio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from app.database import check_db_connection, init_db
from app.routers import transactions, summary, intent, stt, tts, chat, assistant

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize tables, RLS policies, and seed data on startup
    try:
        await anyio.to_thread.run_sync(init_db)
    except Exception as e:
        print(f"Warning: init_db on startup encountered error: {e}")
    yield

app = FastAPI(title="Pappu API", lifespan=lifespan)

app.include_router(transactions.router)
app.include_router(summary.router)
app.include_router(summary.people_router)
app.include_router(intent.router)
app.include_router(stt.router)
app.include_router(tts.router)
app.include_router(chat.router)
app.include_router(assistant.router)

@app.get("/health")
def health_check():
    db_ok = check_db_connection()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database connection check failed")
    return {"status": "ok", "database": "connected"}
