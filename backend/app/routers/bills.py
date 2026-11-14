"""
Bill split API (PROJECT_SPEC.md §8, §5b Bill Split).

user_id always comes from the verified JWT. Another user's bill is a 404, never a 403.
Nothing here writes a transaction except confirm, undo and mark paid.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.database import get_db
from app.ocr.client import OcrError, SarvamDocAIClient
from app.services import bills as bill_service
from app.services.bill_extract import BillExtractError, BillExtractor
from app.services.bill_planner import SplitPlanner
from app.services.bills import BillError

router = APIRouter(prefix="/bills", tags=["bills"])


class ItemIn(BaseModel):
    id: Optional[uuid.UUID] = None
    name: str = Field(min_length=1, max_length=200)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    amount: Decimal = Field(gt=0)


class ManualBillIn(BaseModel):
    merchant: Optional[str] = None
    bill_date: Optional[date] = None
    items: List[ItemIn]
    tax: Decimal = Field(default=Decimal("0"), ge=0)
    service_charge: Decimal = Field(default=Decimal("0"), ge=0)
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    total: Decimal = Field(gt=0)


class BillPatch(BaseModel):
    merchant: Optional[str] = None
    bill_date: Optional[date] = None
    items: Optional[List[ItemIn]] = None
    tax: Optional[Decimal] = Field(default=None, ge=0)
    service_charge: Optional[Decimal] = Field(default=None, ge=0)
    discount: Optional[Decimal] = Field(default=None, ge=0)
    total: Optional[Decimal] = Field(default=None, gt=0)


class AssignIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    input: Literal["text", "voice"] = "text"


class ItemPeopleIn(BaseModel):
    people: List[str] = Field(max_length=11)


class ResolvePersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    use_existing: bool


def get_split_planner() -> SplitPlanner:
    return SplitPlanner()


def get_ocr_client() -> SarvamDocAIClient:
    return SarvamDocAIClient()


def get_bill_extractor() -> BillExtractor:
    return BillExtractor()


MAX_IMAGE_BYTES = 8 * 1024 * 1024
# What the file actually is, from its first bytes. The declared content type is not trusted.
IMAGE_SIGNATURES = {b"\xff\xd8\xff": ("image/jpeg", "bill.jpg"), b"\x89PNG\r\n\x1a\n": ("image/png", "bill.png")}


def _image_kind(data: bytes):
    for signature, kind in IMAGE_SIGNATURES.items():
        if data.startswith(signature):
            return kind
    return None


def _http_error(err: BillError) -> HTTPException:
    return HTTPException(
        status_code=err.status_code,
        detail={"message": err.message, "code": err.code, "detail": err.detail},
    )


def _items_payload(items: List[ItemIn]) -> List[Dict[str, Any]]:
    return [{"id": i.id, "name": i.name, "quantity": i.quantity, "amount": i.amount} for i in items]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_bill_from_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    ocr: SarvamDocAIClient = Depends(get_ocr_client),
    extractor: BillExtractor = Depends(get_bill_extractor),
) -> Dict[str, Any]:
    """
    Bill photo in, draft bill out. The image is read into memory, sent for OCR and dropped:
    it is never written to disk or stored.
    """
    data = file.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"message": "That photo is larger than 8 MB.", "code": "image_too_large", "detail": None},
        )
    kind = _image_kind(data)
    if kind is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"message": "Send the bill as a JPEG or PNG photo.", "code": "unsupported_image", "detail": None},
        )
    content_type, filename = kind

    try:
        text = ocr.read_image(data, filename, content_type)
        parsed = extractor.extract(text)
    except OcrError as err:
        code = err.code
        raise HTTPException(
            status_code=422 if code == "unreadable" else 503,
            detail={"message": str(err), "code": code, "detail": None},
        )
    except BillExtractError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": str(err), "code": "unreadable", "detail": None},
        )

    try:
        bill = bill_service.create_draft(
            db, user_id, merchant=parsed.merchant, bill_date=parsed.bill_date, items=parsed.items,
            tax=parsed.tax, service_charge=parsed.service_charge, discount=parsed.discount, total=parsed.total,
        )
    except BillError as err:
        raise _http_error(err)
    response = bill_service.serialize_bill(db, bill)
    response["extraction"] = {
        "confidence": parsed.confidence,
        "requires_confirmation": True,
        "missing_fields": parsed.missing_fields,
    }
    return response


@router.post("/manual", status_code=status.HTTP_201_CREATED)
def create_manual_bill(
    body: ManualBillIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    """A draft from typed items: the fallback when a photo cannot be read."""
    try:
        bill = bill_service.create_draft(
            db, user_id, merchant=body.merchant, bill_date=body.bill_date, items=_items_payload(body.items),
            tax=body.tax, service_charge=body.service_charge, discount=body.discount, total=body.total,
        )
    except BillError as err:
        raise _http_error(err)
    return bill_service.serialize_bill(db, bill)


@router.get("/{bill_id}")
def get_bill(
    bill_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        return bill_service.serialize_bill(db, bill_service.get_bill(db, user_id, bill_id))
    except BillError as err:
        raise _http_error(err)


@router.patch("/{bill_id}")
def patch_bill(
    bill_id: uuid.UUID,
    body: BillPatch,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    patch = body.model_dump(exclude_unset=True)
    if body.items is not None:
        patch["items"] = _items_payload(body.items)
    try:
        return bill_service.serialize_bill(db, bill_service.update_draft(db, user_id, bill_id, patch))
    except BillError as err:
        db.rollback()
        raise _http_error(err)


@router.post("/{bill_id}/assign")
def assign(
    bill_id: uuid.UUID,
    body: AssignIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    planner: SplitPlanner = Depends(get_split_planner),
) -> Dict[str, Any]:
    try:
        return bill_service.assign_from_text(db, user_id, bill_id, body.text, planner)
    except BillError as err:
        db.rollback()
        raise _http_error(err)


@router.put("/{bill_id}/items/{item_id}/people")
def put_item_people(
    bill_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ItemPeopleIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        bill = bill_service.set_item_people(db, user_id, bill_id, item_id, body.people)
    except BillError as err:
        db.rollback()
        raise _http_error(err)
    return bill_service.serialize_bill(db, bill)


@router.post("/{bill_id}/people/resolve")
def resolve_person(
    bill_id: uuid.UUID,
    body: ResolvePersonIn,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        bill = bill_service.resolve_person(db, user_id, bill_id, body.name, body.use_existing)
    except BillError as err:
        db.rollback()
        raise _http_error(err)
    return bill_service.serialize_bill(db, bill)


@router.post("/{bill_id}/confirm")
def confirm(
    bill_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        return bill_service.confirm_bill(db, user_id, bill_id)
    except BillError as err:
        db.rollback()
        raise _http_error(err)


@router.post("/{bill_id}/undo")
def undo(
    bill_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        return bill_service.undo_bill(db, user_id, bill_id)
    except BillError as err:
        db.rollback()
        raise _http_error(err)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel(
    bill_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Response:
    try:
        bill_service.cancel_draft(db, user_id, bill_id)
    except BillError as err:
        db.rollback()
        raise _http_error(err)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{bill_id}/shares/{share_id}/request")
def get_pay_request(
    bill_id: uuid.UUID,
    share_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        return bill_service.pay_request(db, user_id, bill_id, share_id)
    except BillError as err:
        raise _http_error(err)


@router.post("/{bill_id}/shares/{share_id}/paid")
def mark_paid(
    bill_id: uuid.UUID,
    share_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Dict[str, Any]:
    try:
        return bill_service.mark_share_paid(db, user_id, bill_id, share_id)
    except BillError as err:
        db.rollback()
        raise _http_error(err)
