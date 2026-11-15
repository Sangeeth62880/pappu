"""
One shared HTTP client for calls to Sarvam (LLM, speech-to-text, text-to-speech).

Opening a new httpx.Client per call meant a new TCP and TLS handshake every time.
A shared client keeps the connection to api.sarvam.ai open between calls.
httpx.Client is safe to use from several threads.
"""

import threading

import httpx

_lock = threading.Lock()
_client: httpx.Client | None = None

# Sarvam may close a connection that sat idle; keep idle ones for a short while only.
_LIMITS = httpx.Limits(max_connections=40, max_keepalive_connections=10, keepalive_expiry=30.0)


def get_http_client() -> httpx.Client:
    global _client
    if _client is None or _client.is_closed:
        with _lock:
            if _client is None or _client.is_closed:
                _client = httpx.Client(limits=_LIMITS)
    return _client


def post(url: str, *, timeout, **kwargs) -> httpx.Response:
    """
    POST on the shared client. If the server had already closed the kept-alive
    connection, the request is sent once more on a fresh one.
    """
    client = get_http_client()
    try:
        return client.post(url, timeout=timeout, **kwargs)
    except httpx.RemoteProtocolError:
        return client.post(url, timeout=timeout, **kwargs)


def close_http_client() -> None:
    global _client
    with _lock:
        if _client is not None and not _client.is_closed:
            _client.close()
        _client = None
