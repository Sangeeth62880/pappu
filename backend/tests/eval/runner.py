"""
Evaluation harness runner for Pappu Assistant v2.

Loads test cases from cases.jsonl, invokes a pluggable planner,
validates schema conformance strictly, compares against expected plans,
outputs per-group and overall accuracy, and writes results to eval_results/<timestamp>.json.
"""

import sys
import os
import json
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Any, List, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from pydantic import ValidationError

from app.schemas.plan_v2 import PlanV2
from tests.eval.baseline_adapter import is_case_expressible, old_intent_to_v2_plan


def validate_plan_schema(plan_dict: Any) -> PlanV2:
    """
    Validates that a generated plan conforms to the PlanV2 schema.
    Fails loudly with an exception if invalid.
    """
    if plan_dict is None:
        raise ValueError("Planner returned None. Output must be a valid PlanV2 dictionary.")
    try:
        return PlanV2.model_validate(plan_dict)
    except ValidationError as e:
        raise ValueError(f"CRITICAL: Schema invalid output from planner: {e}") from e


def compare_plans(actual: PlanV2, expected: PlanV2) -> Tuple[bool, str]:
    """
    Compares an actual PlanV2 instance to an expected PlanV2 instance.
    Returns (True, "Match") or (False, reason).
    """
    if len(actual.ops) != len(expected.ops):
        return False, f"Op count mismatch: expected {len(expected.ops)}, got {len(actual.ops)}"

    for idx, (act_op, exp_op) in enumerate(zip(actual.ops, expected.ops)):
        if act_op.op != exp_op.op:
            return False, f"Op[{idx}] op mismatch: expected {exp_op.op}, got {act_op.op}"

        if exp_op.op == "add":
            if act_op.kind != exp_op.kind:
                return False, f"Op[{idx}] add kind mismatch: expected {exp_op.kind}, got {act_op.kind}"
            if round(float(act_op.amount or 0), 2) != round(float(exp_op.amount or 0), 2):
                return False, f"Op[{idx}] add amount mismatch: expected {exp_op.amount}, got {act_op.amount}"
            if exp_op.kind == "person":
                if act_op.direction != exp_op.direction:
                    return False, f"Op[{idx}] add person direction mismatch: expected {exp_op.direction}, got {act_op.direction}"
                if (act_op.contact or "").lower() != (exp_op.contact or "").lower():
                    return False, f"Op[{idx}] add person contact mismatch: expected {exp_op.contact}, got {act_op.contact}"
            if exp_op.category and (act_op.category or "").lower() != exp_op.category.lower():
                return False, f"Op[{idx}] add category mismatch: expected {exp_op.category}, got {act_op.category}"
            if exp_op.date and act_op.date != exp_op.date:
                return False, f"Op[{idx}] add date mismatch: expected {exp_op.date}, got {act_op.date}"

        elif exp_op.op == "delete":
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["contact", "category", "amount", "recency", "direction", "date_from", "date_to"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if isinstance(exp_val, str):
                        if (act_val or "").lower() != exp_val.lower():
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"
                    elif isinstance(exp_val, (int, float)):
                        if act_val is None or round(float(act_val), 2) != round(float(exp_val), 2):
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"
                    else:
                        if act_val != exp_val:
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "edit":
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["ref", "contact", "category", "amount", "recency"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if act_val != exp_val:
                        return False, f"Op[{idx}] edit selector.{field} mismatch: expected {exp_val}, got {act_val}"
            for k, exp_val in exp_op.patch.items():
                act_val = act_op.patch.get(k)
                if isinstance(exp_val, (int, float)):
                    if act_val is None or round(float(act_val), 2) != round(float(exp_val), 2):
                        return False, f"Op[{idx}] edit patch.{k} mismatch: expected {exp_val}, got {act_val}"
                elif isinstance(exp_val, str):
                    if (act_val or "").lower() != exp_val.lower():
                        return False, f"Op[{idx}] edit patch.{k} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "query":
            if act_op.query_kind != exp_op.query_kind:
                return False, f"Op[{idx}] query query_kind mismatch: expected {exp_op.query_kind}, got {act_op.query_kind}"
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["contact", "category", "amount_min", "amount_max"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if isinstance(exp_val, str):
                        if (act_val or "").lower() != (exp_val and exp_val.lower()):
                            return False, f"Op[{idx}] query selector.{field} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "clarify":
            if exp_op.missing:
                exp_missing = set(exp_op.missing)
                act_missing = set(act_op.missing or [])
                if not exp_missing.issubset(act_missing):
                    return False, f"Op[{idx}] clarify missing mismatch: expected {exp_op.missing}, got {act_op.missing}"

        elif exp_op.op == "chat":
            pass

        elif exp_op.op == "answer_pending":
            if str(act_op.value).lower() != str(exp_op.value).lower():
                return False, f"Op[{idx}] answer_pending value mismatch: expected {exp_op.value}, got {act_op.value}"

        elif exp_op.op == "undo":
            pass

    return True, "Match"


def create_baseline_planner() -> Callable[[str, Dict[str, Any], Dict[str, Any]], Tuple[Optional[Dict[str, Any]], bool]]:
    """
    Creates a baseline planner that runs the legacy SarvamLLMClient
    adapted to the PlanV2 shape. Returns (plan_dict, expressible).
    """
    from app.llm.client import SarvamLLMClient

    llm_client = SarvamLLMClient()

    def baseline_planner(text: str, context: Dict[str, Any], case: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], bool]:
        if not is_case_expressible(case):
            return None, False

        for attempt in range(3):
            try:
                time.sleep(0.2)
                intent = llm_client.parse_intent(text)
                plan = old_intent_to_v2_plan(intent)
                return plan.model_dump(), True
            except Exception as e:
                if "429" in str(e) or "Rate limit" in str(e):
                    time.sleep(2.0 * (attempt + 1))
                    continue
                # If parsing failed or threw, return None, expressible
                return None, True
        return None, True

    return baseline_planner


def run_evaluation(
    cases_file: str,
    planner_fn: Callable[[str, Dict[str, Any], Dict[str, Any]], Tuple[Optional[Dict[str, Any]], bool]],
    planner_name: str = "baseline",
    max_workers: int = 4,
    output_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Runs the full evaluation dataset against the pluggable planner.
    """
    cases_path = Path(cases_file)
    if not cases_path.exists():
        raise FileNotFoundError(f"Cases file not found: {cases_path}")

    cases: List[Dict[str, Any]] = []
    with open(cases_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))

    print(f"\n=======================================================")
    print(f"Starting Evaluation with Planner: {planner_name}")
    print(f"Loaded {len(cases)} cases from {cases_path.name}")
    print(f"Workers: {max_workers}")
    print(f"=======================================================\n")

    results: List[Dict[str, Any]] = []

    def evaluate_single_case(case: Dict[str, Any]) -> Dict[str, Any]:
        case_id = case["id"]
        group = case["group"]
        input_text = case["input"]
        context = case["context"]
        expected_plan_dict = case["expected_plan"]

        expected_plan = PlanV2.model_validate(expected_plan_dict)
        plan_dict, expressible = planner_fn(input_text, context, case)

        if not expressible:
            return {
                "id": case_id,
                "group": group,
                "input": input_text,
                "expressible": False,
                "passed": False,
                "reason": "Not expressible in legacy schema",
                "actual_plan": None,
                "expected_plan": expected_plan_dict,
            }

        if plan_dict is None:
            return {
                "id": case_id,
                "group": group,
                "input": input_text,
                "expressible": True,
                "passed": False,
                "reason": "Planner failed to produce an output",
                "actual_plan": None,
                "expected_plan": expected_plan_dict,
            }

        # Validate strictly against PlanV2 schema (fails loudly on error)
        actual_plan = validate_plan_schema(plan_dict)

        # Compare with expected plan
        passed, reason = compare_plans(actual_plan, expected_plan)

        return {
            "id": case_id,
            "group": group,
            "input": input_text,
            "expressible": True,
            "passed": passed,
            "reason": reason,
            "actual_plan": actual_plan.model_dump(),
            "expected_plan": expected_plan_dict,
        }

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_case = {executor.submit(evaluate_single_case, c): c for c in cases}
        for future in as_completed(future_to_case):
            res = future.result()
            results.append(res)
            status_symbol = "✓" if res["passed"] else ("⊘" if not res["expressible"] else "✗")
            print(f"[{status_symbol}] {res['group']} | {res['id']}: {res['reason']}")

    elapsed_time = round(time.time() - start_time, 2)

    # Compute metrics per group and overall
    groups = sorted(list(set(c["group"] for c in cases)))
    group_stats: Dict[str, Dict[str, Any]] = {}

    total_cases = len(cases)
    total_passed = sum(1 for r in results if r["passed"])
    total_expressible = sum(1 for r in results if r["expressible"])
    total_inexpressible = total_cases - total_expressible

    for grp in groups:
        grp_results = [r for r in results if r["group"] == grp]
        grp_total = len(grp_results)
        grp_passed = sum(1 for r in grp_results if r["passed"])
        grp_expr = sum(1 for r in grp_results if r["expressible"])
        group_stats[grp] = {
            "total": grp_total,
            "passed": grp_passed,
            "expressible": grp_expr,
            "not_expressible": grp_total - grp_expr,
            "accuracy": round((grp_passed / grp_total) * 100.0, 1),
            "expressible_accuracy": round((grp_passed / grp_expr) * 100.0, 1) if grp_expr > 0 else 0.0,
        }

    overall_accuracy = round((total_passed / total_cases) * 100.0, 1)
    expressible_accuracy = round((total_passed / total_expressible) * 100.0, 1) if total_expressible > 0 else 0.0

    print("\n" + "=" * 80)
    print(f"EVALUATION RESULTS SUMMARY: {planner_name}")
    print("=" * 80)
    print(f"{'Group':<26} | {'Total':<6} | {'Pass':<6} | {'Not Expr':<9} | {'Accuracy':<10} | {'Expr Acc'}")
    print("-" * 80)
    for grp, stats in group_stats.items():
        print(f"{grp:<26} | {stats['total']:<6} | {stats['passed']:<6} | {stats['not_expressible']:<9} | {stats['accuracy']:>7.1f}% | {stats['expressible_accuracy']:>7.1f}%")
    print("-" * 80)
    print(f"{'OVERALL':<26} | {total_cases:<6} | {total_passed:<6} | {total_inexpressible:<9} | {overall_accuracy:>7.1f}% | {expressible_accuracy:>7.1f}%")
    print(f"Time taken: {elapsed_time}s")
    print("=" * 80 + "\n")

    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(output_dir) if output_dir else Path(__file__).parent / "eval_results"
    out_dir.mkdir(parents=True, exist_ok=True)

    result_payload = {
        "planner": planner_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_cases": total_cases,
        "total_passed": total_passed,
        "total_expressible": total_expressible,
        "total_inexpressible": total_inexpressible,
        "overall_accuracy": overall_accuracy,
        "expressible_accuracy": expressible_accuracy,
        "elapsed_seconds": elapsed_time,
        "group_stats": group_stats,
        "results": sorted(results, key=lambda x: x["id"]),
    }

    out_file = out_dir / f"{timestamp_str}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result_payload, f, indent=2, ensure_ascii=False)

    # Also save a pointer or symlink to baseline.json if planner is baseline
    if planner_name == "baseline":
        baseline_file = out_dir / "baseline.json"
        with open(baseline_file, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2, ensure_ascii=False)
        print(f"Saved baseline results to {baseline_file}")

    print(f"Saved timestamped results to {out_file}")

    return result_payload


def main():
    parser = argparse.ArgumentParser(description="Pappu Assistant v2 Evaluation Runner")
    parser.add_argument("--cases", default=str(Path(__file__).parent / "cases.jsonl"), help="Path to cases.jsonl")
    parser.add_argument("--planner", default="baseline", help="Planner name: 'baseline'")
    parser.add_argument("--workers", type=int, default=5, help="Number of concurrent worker threads")
    parser.add_argument("--output-dir", default=None, help="Directory to save evaluation results")

    args = parser.parse_args()

    if args.planner == "baseline":
        planner_fn = create_baseline_planner()
    else:
        raise ValueError(f"Unknown planner: {args.planner}")

    run_evaluation(
        cases_file=args.cases,
        planner_fn=planner_fn,
        planner_name=args.planner,
        max_workers=args.workers,
        output_dir=args.output_dir,
    )


if __name__ == "__main__":
    main()
