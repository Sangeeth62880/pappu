from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Tuple, List, Dict, Any, Optional, Union
import calendar

# Shared IST Timezone
IST = ZoneInfo("Asia/Kolkata")

def get_current_ist_datetime() -> datetime:
    """Returns current datetime in IST (Asia/Kolkata)."""
    return datetime.now(IST)

def get_period_bounds(
    period: str = "week",
    ref_dt: Optional[datetime] = None,
) -> Tuple[date, date, date, date]:
    """
    Computes (current_start_date, current_end_date, prev_start_date, prev_end_date)
    in IST dates based on period ('week' | 'month' | 'year').
    
    - week: Monday to Sunday (and prior Monday to prior Sunday)
    - month: 1st of month to last day of month (and 1st of prior month to last day of prior month)
    - year: Jan 1 to Dec 31 (and Jan 1 to Dec 31 of prior year)
    """
    if ref_dt is None:
        ref_dt = get_current_ist_datetime()
    elif ref_dt.tzinfo is None:
        ref_dt = ref_dt.replace(tzinfo=IST)
    else:
        ref_dt = ref_dt.astimezone(IST)

    ref_date = ref_dt.date()

    if period == "month":
        # Current month
        year = ref_date.year
        month = ref_date.month
        last_day = calendar.monthrange(year, month)[1]
        curr_start = date(year, month, 1)
        curr_end = date(year, month, last_day)

        # Previous month
        if month == 1:
            prev_year = year - 1
            prev_month = 12
        else:
            prev_year = year
            prev_month = month - 1
        prev_last_day = calendar.monthrange(prev_year, prev_month)[1]
        prev_start = date(prev_year, prev_month, 1)
        prev_end = date(prev_year, prev_month, prev_last_day)

    elif period == "year":
        # Current year
        curr_start = date(ref_date.year, 1, 1)
        curr_end = date(ref_date.year, 12, 31)

        # Previous year
        prev_start = date(ref_date.year - 1, 1, 1)
        prev_end = date(ref_date.year - 1, 12, 31)

    else:
        # Default: week (Monday to Sunday)
        # ref_date.weekday(): 0 = Monday, 6 = Sunday
        curr_start = ref_date - timedelta(days=ref_date.weekday())
        curr_end = curr_start + timedelta(days=6)

        prev_start = curr_start - timedelta(days=7)
        prev_end = curr_end - timedelta(days=7)

    return curr_start, curr_end, prev_start, prev_end


def generate_zero_filled_buckets(
    period: str,
    curr_start: date,
    curr_end: date,
) -> List[Dict[str, Any]]:
    """
    Generates zero-filled buckets for the entire period.
    - week: 7 daily buckets (Mon..Sun)
    - month: day 1 to last day of month
    - year: 12 monthly buckets (Jan..Dec)
    """
    buckets: List[Dict[str, Any]] = []

    if period == "year":
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        for m in range(1, 13):
            buckets.append({
                "date": f"{curr_start.year}-{m:02d}",
                "label": months[m - 1],
                "amount": 0.0,
            })
    elif period == "month":
        curr = curr_start
        while curr <= curr_end:
            buckets.append({
                "date": curr.isoformat(),
                "label": str(curr.day),
                "amount": 0.0,
            })
            curr += timedelta(days=1)
    else:
        # week
        day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        curr = curr_start
        for i in range(7):
            d = curr_start + timedelta(days=i)
            buckets.append({
                "date": d.isoformat(),
                "label": day_labels[d.weekday()],
                "amount": 0.0,
            })

    return buckets


def resolve_period_to_dates(
    period: str,
    ref_date: Optional[Union[date, datetime, str]] = None,
) -> Tuple[date, date]:
    """
    Computes (date_from, date_to) inclusive in IST dates for named relative periods:
    - today: current date to current date
    - yesterday: current date - 1 day to current date - 1 day
    - this_week: Monday to Sunday of current week
    - last_week: Monday to Sunday of previous week
    - this_month: 1st of current month to last day of current month
    - last_month: 1st of previous month to last day of previous month
    - last_7_days: current date - 6 days to current date (7 days inclusive)
    - last_30_days: current date - 29 days to current date (30 days inclusive)
    - this_year: Jan 1 to Dec 31 of current year
    """
    if ref_date is None:
        today_date = get_current_ist_datetime().date()
    elif isinstance(ref_date, str):
        today_date = date.fromisoformat(ref_date)
    elif isinstance(ref_date, datetime):
        today_date = ref_date.astimezone(IST).date() if ref_date.tzinfo else ref_date.date()
    else:
        today_date = ref_date

    clean_p = (period or "").strip().lower()

    if clean_p == "today":
        return today_date, today_date

    elif clean_p == "yesterday":
        y = today_date - timedelta(days=1)
        return y, y

    elif clean_p == "this_week":
        monday = today_date - timedelta(days=today_date.weekday())
        sunday = monday + timedelta(days=6)
        return monday, sunday

    elif clean_p == "last_week":
        curr_monday = today_date - timedelta(days=today_date.weekday())
        last_monday = curr_monday - timedelta(days=7)
        last_sunday = last_monday + timedelta(days=6)
        return last_monday, last_sunday

    elif clean_p == "this_month":
        last_day = calendar.monthrange(today_date.year, today_date.month)[1]
        return date(today_date.year, today_date.month, 1), date(today_date.year, today_date.month, last_day)

    elif clean_p == "last_month":
        if today_date.month == 1:
            prev_year = today_date.year - 1
            prev_month = 12
        else:
            prev_year = today_date.year
            prev_month = today_date.month - 1
        last_day = calendar.monthrange(prev_year, prev_month)[1]
        return date(prev_year, prev_month, 1), date(prev_year, prev_month, last_day)

    elif clean_p in ("last_7_days", "past_7_days"):
        return today_date - timedelta(days=6), today_date

    elif clean_p in ("last_30_days", "past_30_days"):
        return today_date - timedelta(days=29), today_date

    elif clean_p == "this_year":
        return date(today_date.year, 1, 1), date(today_date.year, 12, 31)

    raise ValueError(f"Unknown relative period: {period}")
