import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Literal, List
from pydantic import BaseModel, ConfigDict, Field

class TransactionBase(BaseModel):
    type: Literal["income", "expense"]
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    category_id: int
    contact_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    txn_date: date

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    type: Optional[Literal["income", "expense"]] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    category_id: Optional[int] = None
    contact_id: Optional[uuid.UUID] = None
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
    contact_id: Optional[uuid.UUID] = None
    contact_name: Optional[str] = None
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

class ContactSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contact_id: uuid.UUID
    contact_name: str
    total_sent: Decimal  # sum of expense
    total_received: Decimal  # sum of income
    net_balance: Decimal  # total_sent - total_received
    status: str  # 'owes_you' | 'you_owe' | 'settled'
    display_text: str
    transaction_count: int

class PeopleSummaryResponse(BaseModel):
    contacts: List[ContactSummaryItem]
    total_owed_to_user: Decimal
    total_user_owes: Decimal

class ContactDetailResponse(BaseModel):
    contact_id: uuid.UUID
    contact_name: str
    total_sent: Decimal
    total_received: Decimal
    net_balance: Decimal
    status: str
    display_text: str
    transactions: List[TransactionResponse]

