"""
Pappu Assistant v2 Planner.

The sole LLM call in v2:
1. Fast path: resolves pending items on exact match keywords without LLM calls.
2. Formats system prompt with static rules and dynamic context.
3. Invokes Sarvam LLM via existing client.
4. Schema validation with 1 retry on validation error.
5. Fallback clarify plan on second schema failure.
6. Traces latency and raw output.
"""

import json
import logging
import time
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.assistant.schemas import Plan, ClarifyAction, AnswerPendingAction
from app.assistant.context import AssistantContext
from app.assistant.sanitizer import sanitize_plan
from app.llm.client import SarvamLLMClient, _extract_json_from_response
from app.services.tracing import AssistantTracer

logger = logging.getLogger(__name__)

PROMPT_FILE_PATH = Path(__file__).parent / "prompt.md"

FAST_PATH_EXACT_MATCHES = {
    "yes": "yes",
    "ok": "yes",
    "aam": "yes",
    "ഉവ്വ്": "yes",
    "no": "no",
    "cancel": "no",
    "വേണ്ട": "no",
}

FAST_PATH_CONTACT_CONFIRM = {
    "new": "yes",
    "yeah": "yes",
    "yep": "yes",
    "haan": "yes",
    "nope": "no",
}


def _load_prompt_template() -> str:
    return PROMPT_FILE_PATH.read_text(encoding="utf-8")


def check_fast_path(text: str, context: Any) -> Optional[Plan]:
    """
    Fast path before LLM:
    If a pending item exists and text matches exactly yes, no, ok, cancel, aam, ഉവ്വ് or വേണ്ട,
    returns an answer_pending plan directly.
    For contact_confirm items, also fast paths "new", "yeah", "yep", "haan" to "yes"
    and "nope" to "no".
    """
    if not context:
        return None

    # Handle AssistantContext, PendingItemContextItem, or dict
    pending = getattr(context, "pending_item", None)
    if pending is None and hasattr(context, "kind"):
        pending = context
    elif pending is None and isinstance(context, dict):
        pending = context.get("pending_item") or context

    if not pending:
        return None

    clean = text.strip().lower()
    clean = clean.rstrip(".").rstrip("!").rstrip("?")

    kind = getattr(pending, "kind", None)
    if not kind and hasattr(pending, "action_type"):
        kind = getattr(pending, "action_type", None)
    if not kind and isinstance(pending, dict):
        kind = pending.get("kind") or pending.get("action_type")

    if kind == "contact_confirm" and clean in FAST_PATH_CONTACT_CONFIRM:
        resolved_value = FAST_PATH_CONTACT_CONFIRM[clean]
        return Plan(actions=[AnswerPendingAction(value=resolved_value)])

    if clean in FAST_PATH_EXACT_MATCHES:
        resolved_value = FAST_PATH_EXACT_MATCHES[clean]
        return Plan(actions=[AnswerPendingAction(value=resolved_value)])

    return None


class AssistantPlanner:
    def __init__(self, llm_client: Optional[SarvamLLMClient] = None):
        self.llm_client = llm_client or SarvamLLMClient()
        self.prompt_template = _load_prompt_template()

    def build_system_prompt(
        self,
        context: AssistantContext,
        include_reasoning: bool = False,
    ) -> str:
        ctx_dict = context.to_dict_for_prompt()
        ctx_str = json.dumps(ctx_dict, indent=2, ensure_ascii=False)
        rendered = self.prompt_template.replace("{context}", ctx_str)

        if include_reasoning:
            reasoning_instruction = (
                "\n\nAdditional Instruction: Include a brief explanation in the 'reasoning' field of the Plan.\n"
            )
            rendered += reasoning_instruction
        else:
            no_reasoning_instruction = (
                "\n\nAdditional Instruction: Do not include a 'reasoning' field in your JSON output. Return only 'ops'.\n"
            )
            rendered += no_reasoning_instruction

        return rendered

    def plan(
        self,
        text: str,
        context: AssistantContext,
        tracer: Optional[AssistantTracer] = None,
        include_reasoning: bool = False,
    ) -> Plan:
        """
        Produce a structured Plan for user text.
        One retry on schema failure sending validation error back.
        Fallback to single clarify after second failure.
        """
        # 1. Fast path check
        fast_plan = check_fast_path(text, context)
        if fast_plan:
            if tracer:
                tracer.set_llm_output("[FAST_PATH_PRE_LLM]")
                tracer.set_plan(fast_plan.model_dump())
            return fast_plan

        system_prompt = self.build_system_prompt(context, include_reasoning=include_reasoning)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ]

        # 2. First attempt
        t0 = time.perf_counter()
        raw_output = self.llm_client._make_request(messages)
        t_first = (time.perf_counter() - t0) * 1000.0

        if tracer:
            tracer.set_llm_output(raw_output)
            tracer.latency_ms_per_stage["planner"] = t_first

        first_error: Optional[str] = None
        try:
            json_str = _extract_json_from_response(raw_output)
            data = json.loads(json_str)
            plan_obj = Plan.model_validate(data)
            plan_obj = sanitize_plan(plan_obj, text)
            if tracer:
                tracer.set_plan(plan_obj.model_dump())
            return plan_obj
        except (json.JSONDecodeError, ValidationError, ValueError) as err:
            first_error = str(err)
            logger.warning("First planner attempt schema failure: %s", first_error)

        # 3. Second attempt with validation feedback
        retry_prompt = (
            f"Your previous response failed validation with error: {first_error}. "
            "Fix the JSON so it strictly adheres to the schema. Output only the JSON object."
        )
        retry_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
            {"role": "assistant", "content": raw_output},
            {"role": "user", "content": retry_prompt},
        ]

        t1 = time.perf_counter()
        retry_output = self.llm_client._make_request(retry_messages)
        t_second = (time.perf_counter() - t1) * 1000.0

        if tracer:
            tracer.set_llm_output(f"First:\n{raw_output}\n\nRetry:\n{retry_output}")
            tracer.latency_ms_per_stage["planner"] = t_first + t_second

        try:
            retry_json_str = _extract_json_from_response(retry_output)
            retry_data = json.loads(retry_json_str)
            plan_obj = Plan.model_validate(retry_data)
            plan_obj = sanitize_plan(plan_obj, text)
            if tracer:
                tracer.set_plan(plan_obj.model_dump())
            return plan_obj
        except Exception as retry_err:
            logger.error("Second planner attempt also failed: %s", retry_err)
            fallback = Plan(
                actions=[
                    ClarifyAction(
                        question="Sorry, could you say that again?",
                        missing_fields=[],
                    )
                ]
            )
            if tracer:
                tracer.schema_valid = False
                tracer.set_plan(fallback.model_dump())
            return fallback
