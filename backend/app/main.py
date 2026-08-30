from fastapi import FastAPI, HTTPException
from app.database import check_db_connection

app = FastAPI(title="Pappu API")

@app.get("/health")
def health_check():
    db_ok = check_db_connection()
    if not db_ok:
        raise HTTPException(status_code=500, detail="Database connection check failed")
    return {"status": "ok", "database": "connected"}
