"""
Tracing helpers for Pappu Assistant v2.

Provides an AssistantTracer context manager that measures stage latencies
and persists execution traces to the assistant_traces database table.
All traces are strictly scoped to the verified JWT user_id.
"""

import time
import json
import uuid
import logging
from contextlib import contextmanager
from typing import Optional, Dict, Any, Union, TYPE_CHECKING
from sqlalchemy.orm import Session

from app.models.assistant_trace import AssistantTrace

if TYPE_CHECKING:
    from app.assistant.schemas import PlanV2

logger = logging.getLogger(__name__)


class AssistantTracer:
    """
    Context manager and helper for timing pipeline stages and persisting traces.
    """

    def __init__(
        self,
        db: Optional[Session] = None,
        user_id: Optional[uuid.UUID] = None,
        message_text: str = "",
        input_type: str = "text",
        context_json: Optional[Dict[str, Any]] = None,
    ):
        self.db = db
        self.user_id = user_id
        self.message_text = message_text
        self.input_type = input_type
        self.context_json = context_json
        self.raw_llm_output: Optional[str] = None
        self.plan_json: Optional[Dict[str, Any]] = None
        self.resolver_filters_json: Optional[Dict[str, Any]] = None
        self.result_json: Optional[Dict[str, Any]] = None
        self.latency_ms_per_stage: Dict[str, float] = {}
        self.schema_valid: bool = True
        self.reply_text: Optional[str] = None
        self.spoken_text: Optional[str] = None
        self.trace_record: Optional[AssistantTrace] = None
        self._stage_starts: Dict[str, float] = {}

    def __enter__(self) -> "AssistantTracer":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            if self.result_json is None:
                self.result_json = {}
            self.result_json["error"] = str(exc_val)
            self.result_json["error_type"] = exc_type.__name__
        self.save()

    @contextmanager
    def time_stage(self, stage_name: str):
        """Context manager to measure the elapsed time of a pipeline stage in milliseconds."""
        start_time = time.perf_counter()
        try:
            yield
        finally:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
            self.latency_ms_per_stage[stage_name] = elapsed_ms

    def start_stage(self, stage_name: str) -> None:
        """Begin measuring a stage manually."""
        self._stage_starts[stage_name] = time.perf_counter()

    def end_stage(self, stage_name: str) -> float:
        """End measuring a stage manually and record elapsed milliseconds."""
        start_time = self._stage_starts.pop(stage_name, None)
        if start_time is None:
            logger.warning("Stage %s was not started prior to ending.", stage_name)
            return 0.0
        elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        self.latency_ms_per_stage[stage_name] = elapsed_ms
        return elapsed_ms

    def set_llm_output(self, raw_output: str, schema_valid: bool = True) -> None:
        """Record the raw LLM response text and schema validity flag."""
        self.raw_llm_output = raw_output
        self.schema_valid = schema_valid

    def set_raw_llm_output(self, raw_output: str, schema_valid: bool = True) -> None:
        """Record the raw LLM response text and schema validity flag (alias)."""
        self.set_llm_output(raw_output, schema_valid=schema_valid)

    def set_plan(self, plan: Union[Dict[str, Any], "PlanV2", None]) -> None:
        """Record the structured plan object."""
        if plan is None:
            self.plan_json = None
        elif hasattr(plan, "model_dump"):
            self.plan_json = plan.model_dump()
        elif isinstance(plan, dict):
            self.plan_json = plan
        else:
            self.plan_json = dict(plan)

    def set_resolver_filters(self, filters: Optional[Dict[str, Any]]) -> None:
        """Record the deterministic filters passed to the resolver."""
        self.resolver_filters_json = filters

    def set_result(self, result: Optional[Dict[str, Any]]) -> None:
        """Record the final execution or response result."""
        self.result_json = result

    def set_reply(self, reply_text: Optional[str] = None, spoken_text: Optional[str] = None) -> None:
        """Record the final user-facing reply_text and spoken_text."""
        self.reply_text = reply_text
        self.spoken_text = spoken_text

    def save(self) -> Optional[AssistantTrace]:
        """
        Persist the trace record to the assistant_traces database table.
        Returns the saved AssistantTrace record or None if db/user_id not provided.
        """
        if self.db is None or self.user_id is None:
            return None

        if self.trace_record is not None:
            return self.trace_record

        def _clean_json(obj):
            if obj is None:
                return None
            return json.loads(json.dumps(obj, default=str))

        trace = AssistantTrace(
            user_id=self.user_id,
            message_text=self.message_text,
            input_type=self.input_type,
            context_json=_clean_json(self.context_json),
            raw_llm_output=self.raw_llm_output,
            plan_json=_clean_json(self.plan_json),
            resolver_filters_json=_clean_json(self.resolver_filters_json),
            result_json=_clean_json(self.result_json),
            latency_ms_per_stage=self.latency_ms_per_stage,
            schema_valid=self.schema_valid,
            reply_text=self.reply_text,
            spoken_text=self.spoken_text,
        )

        try:
            self.db.add(trace)
            self.db.commit()
            self.db.refresh(trace)
            self.trace_record = trace
            return trace
        except Exception as e:
            self.db.rollback()
            logger.error("Failed to save assistant trace for user %s: %s", self.user_id, e)
            raise
