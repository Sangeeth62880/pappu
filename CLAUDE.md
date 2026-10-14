# CLAUDE.md — Agent Instructions for Pappu

Read `PROJECT_SPEC.md` and `BUILD_PHASES.md` before starting any task. This file holds standing rules that apply across every session — do not re-derive or contradict these.

## Non-negotiable rules

1. **The LLM intent layer never touches the database directly.** It only produces the JSON object defined in `PROJECT_SPEC.md §5`. All DB writes go through the backend.
2. **Never auto-execute an edit or delete.** Every edit/delete goes through the confirmation routing (`§6`) — single match → confirm, multiple match → disambiguate. No exceptions, even in test/demo mode.
3. **Categories are a fixed, seeded list.** Never let the LLM or backend create a new category on the fly. Ambiguous category → "Other" or one clarifying question.
4. **Every intent object must include `confidence`, `requires_confirmation`, and `missing_fields`.** If you're writing an LLM prompt or parser that omits any of these, it's incomplete — stop and fix it before moving on.
5. **Don't skip ahead to voice.** Build and test the LLM intent layer and confirmation logic against plain text input first (Phase 2–3 in `BUILD_PHASES.md`). STT/TTS are wired in last (Phase 6–7).
6. **Auth is Supabase Auth — never build custom login/register/password logic.** The frontend gets sessions/JWTs from the Supabase client SDK directly. The backend only ever verifies the incoming JWT and extracts `user_id` from it — it never trusts a `user_id` passed in a request body.
7. **Per-user data isolation is enforced by application-layer filtering, not by RLS.** FastAPI connects via the `postgres` role, which bypasses RLS — so every query must explicitly scope with `WHERE user_id = :verified_user_id`, using the `user_id` extracted from the verified JWT (never from the request body). RLS is enabled on the tables as a secondary safeguard for any future path that queries via Supabase's Data API directly, but it is not what protects the backend's own queries — don't write isolation tests that assume otherwise.
8. **Intent classification is the LLM planner's job. Resolution, execution and replies are deterministic code. No keyword or regex intent classification.**
9. **UI uses design tokens and ui/ primitives only. No hardcoded colors, fonts, or spacing in screens.**

## Working conventions

- **Commit after each completed task in `BUILD_PHASES.md`**, not at the end of a phase. Each commit should correspond to one working, tested unit.
- **Write or update tests in the same task as the feature**, not as a separate later pass. A task isn't done until its tests pass.
- **Don't move to the next phase until the current phase's acceptance criteria (in `BUILD_PHASES.md`) are met.**
- If a task requires a decision not covered by `PROJECT_SPEC.md`, stop and ask rather than assuming — then add the decision back into the spec file so it isn't re-litigated next session.
- Keep the LLM prompt templates in `backend/app/llm/` as versioned files, not inline strings scattered across the codebase — they need to be iterated on independently of application logic.

## Testing conventions

- Backend: `pytest`, tests live in `backend/tests/`, mirroring the `app/` structure.
- Frontend: `Jest` + React Native Testing Library, tests live in `frontend/tests/`.
- LLM intent parsing tests should include: a clean high-confidence case, a low-confidence/missing-field case, a multi-match disambiguation case, and a code-mixed Malayalam-English input case — for each action type (add/edit/delete/query).