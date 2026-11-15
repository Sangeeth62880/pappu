"""Helpers for user text that goes into a SQL LIKE pattern."""

LIKE_ESCAPE = "\\"


def escape_like(text: str) -> str:
    """
    Makes text literal inside a LIKE / ILIKE pattern, so a "%" or "_" the user typed
    matches itself and not "anything". Use with `.ilike(pattern, escape=LIKE_ESCAPE)`.
    """
    return (
        text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )
