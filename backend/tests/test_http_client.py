"""The shared Sarvam HTTP client: one connection pool, one resend on a dropped keep-alive."""

from unittest.mock import patch

import httpx

from app import http_client


def test_the_same_client_is_reused_across_calls():
    http_client.close_http_client()
    first = http_client.get_http_client()
    assert http_client.get_http_client() is first
    http_client.close_http_client()


def test_a_closed_client_is_replaced():
    first = http_client.get_http_client()
    http_client.close_http_client()
    second = http_client.get_http_client()
    assert second is not first and not second.is_closed
    http_client.close_http_client()


def test_post_resends_once_when_the_kept_alive_connection_was_dropped():
    ok = httpx.Response(200, json={"ok": True}, request=httpx.Request("POST", "https://example.test/x"))
    with patch("httpx.Client.post", side_effect=[httpx.RemoteProtocolError("server disconnected"), ok]) as post:
        response = http_client.post("https://example.test/x", timeout=5.0, json={})
    assert response.status_code == 200
    assert post.call_count == 2


def test_post_does_not_resend_on_a_timeout():
    with patch("httpx.Client.post", side_effect=httpx.ReadTimeout("slow")) as post:
        try:
            http_client.post("https://example.test/x", timeout=5.0, json={})
            raised = False
        except httpx.ReadTimeout:
            raised = True
    assert raised and post.call_count == 1
