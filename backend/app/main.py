import logging

import anyio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.database import check_db_connection, init_db
from app.http_client import close_http_client
from app.routers import transactions, summary, stt, tts, chat, assistant, profile, contacts, budgets, bills

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize tables, RLS policies, and seed data on startup
    try:
        await anyio.to_thread.run_sync(init_db)
    except Exception as e:
        print(f"Warning: init_db on startup encountered error: {e}")
    yield
    close_http_client()

app = FastAPI(title="Pappu API", lifespan=lifespan)

logger = logging.getLogger(__name__)


# Registered before CORS so it sits inside it: an unhandled error becomes a plain JSON 500
# that still carries the CORS headers (otherwise the browser reports it as "fetch failed"),
# and the exception text goes to the log, not to the client.
@app.middleware("http")
async def unhandled_errors_to_json(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Auth is a bearer token in the Authorization header, never a cookie, so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions.router)
app.include_router(summary.router)
app.include_router(summary.people_router)
app.include_router(contacts.router)
app.include_router(stt.router)
app.include_router(tts.router)
app.include_router(chat.router)
app.include_router(assistant.router)
app.include_router(profile.router)
app.include_router(budgets.router)
app.include_router(bills.router)

@app.get("/health")
def health_check():
    db_ok = check_db_connection()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database connection check failed")
    return {"status": "ok", "database": "connected"}
