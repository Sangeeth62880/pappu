import time
import uuid
import pytest
from app.models.profile import Profile
from app.models.assistant_trace import AssistantTrace
from app.services.tracing import AssistantTracer
from app.schemas.plan_v2 import PlanV2, AddOp
from tests.test_isolation import test_db_session


def test_tracer_timing_and_saving(test_db_session):
    # Setup test profile
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Test User", preferred_language="en")
    test_db_session.add(profile)
    test_db_session.commit()

    # Use tracer as context manager
    with AssistantTracer(
        db=test_db_session,
        user_id=user_id,
        message_text="Spent 250 on lunch",
        input_type="text",
        context_json={"today": "2026-10-14"},
    ) as tracer:
        with tracer.time_stage("llm_call"):
            time.sleep(0.01)
        
        with tracer.time_stage("resolver"):
            time.sleep(0.005)

        tracer.set_llm_output('{"ops": [{"op": "add", "kind": "expense", "amount": 250, "category": "Food"}]}')
        plan = PlanV2(ops=[AddOp(op="add", kind="expense", amount=250, category="Food")])
        tracer.set_plan(plan)
        tracer.set_resolver_filters({"category": "Food"})
        tracer.set_result({"status": "created", "amount": 250})

    # Verify trace was saved to the database
    trace = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_id)
        .first()
    )
    assert trace is not None
    assert trace.message_text == "Spent 250 on lunch"
    assert trace.input_type == "text"
    assert trace.context_json == {"today": "2026-10-14"}
    assert trace.plan_json["ops"][0]["op"] == "add"
    assert trace.resolver_filters_json == {"category": "Food"}
    assert trace.result_json == {"status": "created", "amount": 250}
    assert trace.schema_valid is True
    assert "llm_call" in trace.latency_ms_per_stage
    assert "resolver" in trace.latency_ms_per_stage
    assert trace.latency_ms_per_stage["llm_call"] >= 5.0


def test_tracer_exception_handling(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Error User", preferred_language="en")
    test_db_session.add(profile)
    test_db_session.commit()

    with pytest.raises(ValueError, match="Planner failed"):
        with AssistantTracer(
            db=test_db_session,
            user_id=user_id,
            message_text="Broken request",
        ) as tracer:
            with tracer.time_stage("planning"):
                raise ValueError("Planner failed")

    trace = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_id)
        .first()
    )
    assert trace is not None
    assert trace.message_text == "Broken request"
    assert trace.result_json["error_type"] == "ValueError"
    assert "Planner failed" in trace.result_json["error"]


def test_tracer_user_isolation(test_db_session):
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    test_db_session.add(Profile(id=user_a, name="User A", preferred_language="en"))
    test_db_session.add(Profile(id=user_b, name="User B", preferred_language="en"))
    test_db_session.commit()

    with AssistantTracer(db=test_db_session, user_id=user_a, message_text="User A prompt") as tracer:
        tracer.set_result({"status": "ok"})

    # User B queries traces
    traces_for_b = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_b)
        .all()
    )
    assert len(traces_for_b) == 0

    # User A queries traces
    traces_for_a = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_a)
        .all()
    )
    assert len(traces_for_a) == 1
    assert traces_for_a[0].message_text == "User A prompt"


def test_tracer_set_raw_llm_output_and_reply(test_db_session):
    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Reply User", preferred_language="en")
    test_db_session.add(profile)
    test_db_session.commit()

    with AssistantTracer(
        db=test_db_session,
        user_id=user_id,
        message_text="How much did I spend last week?",
    ) as tracer:
        # Confirm set_raw_llm_output does not raise AttributeError
        tracer.set_raw_llm_output('{"ops": [{"op": "query", "query_kind": "sum"}]}', schema_valid=True)
        tracer.set_reply(reply_text="Spent ₹350 from 5 to 11 Oct.", spoken_text="Spent ₹350 from 5 to 11 Oct.")

    trace = (
        test_db_session.query(AssistantTrace)
        .filter(AssistantTrace.user_id == user_id)
        .first()
    )
    assert trace is not None
    assert trace.raw_llm_output == '{"ops": [{"op": "query", "query_kind": "sum"}]}'
    assert trace.schema_valid is True
    assert trace.reply_text == "Spent ₹350 from 5 to 11 Oct."
    assert trace.spoken_text == "Spent ₹350 from 5 to 11 Oct."
