# Pappu Assistant v2 Plan Specification

This document defines the structured plan schema produced by the v2 LLM planner.

## Overview

The v2 assistant processes user input into a deterministic plan object.
Every plan contains an array of one or more operations executed sequentially or transactionally.

## Schema Structure

A top level plan object contains:
* `ops`: array of operations.
* `reasoning`: optional string describing planner reasoning.

## Supported Operations

### 1. add
Creates a new financial transaction.
Fields:
* `op`: literal `"add"`
* `kind`: `"expense"`, `"income"`, or `"person"`
* `amount`: number (integer or float)
* `direction`: `"sent"` or `"received"` (required when kind is `"person"`)
* `contact`: string (contact name for person transactions)
* `category`: string (optional category such as Food or Transport)
* `date`: string (optional ISO date format YYYY-MM-DD)
* `description`: string (optional note)

### 2. edit
Modifies an existing transaction identified by selector criteria.
Fields:
* `op`: literal `"edit"`
* `selector`: selector object matching the transaction to modify
* `patch`: object containing updated transaction fields

### 3. delete
Deletes one or more transactions identified by selector criteria.
Fields:
* `op`: literal `"delete"`
* `selector`: selector object matching the transaction to remove

### 4. query
Inspects user transactions or aggregate analytics.
Fields:
* `op`: literal `"query"`
* `query_kind`: one of `"balances"`, `"sum"`, `"list"`, `"count"`, `"biggest"`, `"compare"`
* `selector`: selector object defining filter criteria
* `compare_to`: optional secondary selector object for comparisons

### 5. undo
Reverts the last performed mutating action.
Fields:
* `op`: literal `"undo"`
* `ref`: optional action reference identifier

### 6. answer_pending
Resolves an active pending state, such as contact disambiguation or clarification.
Fields:
* `op`: literal `"answer_pending"`
* `value`: resolution value or choice payload

### 7. clarify
Requests clarification when mandatory parameters are missing or ambiguous.
Fields:
* `op`: literal `"clarify"`
* `question`: prompt string to read back to the user
* `missing`: array of missing field names

### 8. chat
Responds to conversational greetings or general queries outside transactions.
Fields:
* `op`: literal `"chat"`
* `message`: response text

## Selector Fields

Selectors locate target transactions deterministically:
* `contact`: string contact name
* `category`: string category name
* `direction`: `"sent"` or `"received"`
* `amount`: exact numeric amount
* `amount_min`: minimum numeric threshold
* `amount_max`: maximum numeric threshold
* `date_from`: ISO date lower bound
* `date_to`: ISO date upper bound
* `recency`: `"latest"` or `"earliest"`
* `nth`: 1 indexed offset
* `ref`: `"last_touched"` to refer to the most recently modified transaction
* `text`: freeform search text
* `limit`: maximum candidate count

## Direction Semantics

Direction maps to transaction type in one place only:
* `sent` maps to `expense`
* `received` maps to `income`
