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
    category_name: Optional[str] = None
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
    percentage: Optional[float] = None

# ─── New Period Analytics Schemas ───

class DailyBucket(BaseModel):
    date: str
    label: str
    amount: Decimal

class ExpenseCategoryItem(BaseModel):
    category: str
    amount: Decimal
    percentage: float

class TopContactItem(BaseModel):
    id: uuid.UUID
    name: str
    net_balance: Decimal
    status: Optional[str] = None

class PeopleCounts(BaseModel):
    owed_to_you: int = 0
    you_owe: int = 0
    settled: int = 0
    total: int = 0

class PeoplePeriodBlock(BaseModel):
    total_owed_to_user: Decimal = Decimal("0.00")
    total_user_owes: Decimal = Decimal("0.00")
    owed_to_you: Decimal = Decimal("0.00")
    you_owe: Decimal = Decimal("0.00")
    counts: PeopleCounts = Field(default_factory=PeopleCounts)
    top_contacts: List[TopContactItem] = Field(default_factory=list)

class TopExpenseItem(BaseModel):
    id: uuid.UUID
    description: Optional[str]
    amount: Decimal
    date: date
    category: str

class SummaryResponse(BaseModel):
    # Period Scoped Fields
    period: str = "week"
    period_start: str = ""
    period_end: str = ""
    total_spent: Decimal = Decimal("0.00")
    total_income: Decimal = Decimal("0.00")
    net: Decimal = Decimal("0.00")
    previous_period_spent: Decimal = Decimal("0.00")
    spent_delta_percentage: Optional[float] = None
    delta_pct: Optional[float] = None
    delta_abs: Decimal = Decimal("0.00")
    avg_per_day: Decimal = Decimal("0.00")
    max_day: Optional[DailyBucket] = None
    mood: Literal["neutral", "worried"] = "neutral"
    daily_buckets: List[DailyBucket] = Field(default_factory=list)
    categories: List[ExpenseCategoryItem] = Field(default_factory=list)
    people: PeoplePeriodBlock = Field(
        default_factory=lambda: PeoplePeriodBlock(
            total_owed_to_user=Decimal("0.00"),
            total_user_owes=Decimal("0.00"),
            owed_to_you=Decimal("0.00"),
            you_owe=Decimal("0.00"),
            counts=PeopleCounts(),
            top_contacts=[],
        )
    )
    top_expenses: List[TopExpenseItem] = Field(default_factory=list)
    recent_transactions: List[TransactionResponse] = Field(default_factory=list)

    # Legacy Backward Compatibility Fields
    balance: Decimal = Decimal("0.00")
    total_expense: Decimal = Decimal("0.00")
    category_breakdown: List[CategoryBreakdownItem] = Field(default_factory=list)
    transaction_count: int = 0

class ContactSummaryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    contact_id: uuid.UUID
    contact_name: str
    phone: Optional[str] = None
    upi_id: Optional[str] = None
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
    phone: Optional[str] = None
    upi_id: Optional[str] = None
    total_sent: Decimal
    total_received: Decimal
    net_balance: Decimal
    status: str
    display_text: str
    transactions: List[TransactionResponse]

class ContactCreateRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    upi_id: Optional[str] = None

class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    phone: Optional[str] = None
    upi_id: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None

class RemindTextResponse(BaseModel):
    remind_text: str
    text: str
    contact_id: uuid.UUID
    contact_name: str
    amount: float
