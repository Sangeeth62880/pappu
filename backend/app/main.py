from fastapi import FastAPI, HTTPException
from app.database import check_db_connection
from app.routers import transactions, summary

app = FastAPI(title="Pappu API")

app.include_router(transactions.router)
app.include_router(summary.router)

@app.get("/health")
def health_check():
    db_ok = check_db_connection()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database connection check failed")
    return {"status": "ok", "database": "connected"}
