# Pappu Assistant Evaluation Suite

This directory contains the end to end evaluation harness and test cases for Pappu Assistant.

## Overview

The evaluation suite verifies planner accuracy, plan validity, and execution correctness across diverse linguistic inputs including English, Malayalam script, and Manglish.

Key assets:
* `cases.jsonl`: Golden evaluation dataset with user inputs, contexts, and expected operations.
* `runner.py`: Harness runner that executes test cases against a planner and scores results.
* `generate_cases.py`: Script to generate or inspect evaluation cases.
* `eval_results/`: Directory storing timestamped evaluation runs and accuracy reports.

## Running the Evaluation

To run evaluation with the v2 planner:

```bash
python tests/eval/runner.py --planner v2
```

To run with execution verification:

```bash
python tests/eval/runner.py --planner v2 --execute
```

To run with custom worker concurrency:

```bash
python tests/eval/runner.py --planner v2 --workers 10
```

To run unit tests verifying the evaluation harness itself:

```bash
pytest tests/test_eval_harness.py
```

## Continuous Integration Note

Always run the full evaluation suite before modifying `app/assistant/prompt.md` or updating planner logic. Ensure overall accuracy meets the target threshold and that all 7 critical regression cases pass before merging changes.
