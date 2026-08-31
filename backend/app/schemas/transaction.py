import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Literal, List
from pydantic import BaseModel, ConfigDict, Field

class TransactionBase(BaseModel):
    type: Literal["income", "expense"]
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    category_id: int
    description: Optional[str] = None
    txn_date: date

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    type: Optional[Literal["income", "expense"]] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    category_id: Optional[int] = None
    description: Optional[str] = None
    txn_date: Optional[date] = None

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    amount: Decimal
    category_id: int
    category_name: Optional[str] = None
    description: Optional[str] = None
    txn_date: date
    created_at: Optional[datetime] = None

class CategoryBreakdownItem(BaseModel):
    category_id: int
    category_name: str
    type: str
    total_amount: Decimal
    count: int

class SummaryResponse(BaseModel):
    balance: Decimal
    total_income: Decimal
    total_expense: Decimal
    category_breakdown: List[CategoryBreakdownItem]
    transaction_count: int
