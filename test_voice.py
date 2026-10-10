"""Voice in Swahili and English: the bilingual prompt, language choice,
prompt-echo guard, and both transcription routes (direct Groq and proxy)."""

import importlib
import os
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


class FakeAsyncClient:
    """Stands in for httpx.AsyncClient; records the request, returns `reply`."""

    calls: list = []
    reply: dict = {}
    status = 200

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, files=None, data=None, headers=None):
        FakeAsyncClient.calls.append({"url": url, "data": dict(data or {}), "headers": headers or {}})

        class R:
            status_code = FakeAsyncClient.status
            text = ""

            def json(self_inner):
                return FakeAsyncClient.reply

        return R()


@pytest.fixture
def fake_http(monkeypatch):
    import httpx
    FakeAsyncClient.calls = []
    FakeAsyncClient.reply = {}
    FakeAsyncClient.status = 200
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    return FakeAsyncClient


@pytest.fixture
def server(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    sys.path.insert(0, str(Path(__file__).parent / "desktop" / "server"))
    try:
        mod = importlib.import_module("server")
    finally:
        sys.path.pop(0)
    monkeypatch.setattr(mod.settings, "groq_api_key", None, raising=False)
    monkeypatch.setattr(mod.settings, "invite_code", None, raising=False)
    monkeypatch.setattr(mod.settings, "anthropic_api_key", None, raising=False)
    monkeypatch.setattr(mod, "_provision_in_background", lambda: None)
    return mod


AUDIO = {"file": ("clip.m4a", b"\x00" * 4096, "audio/mp4")}


def test_prompt_echo_is_treated_as_silence(server):
    p = server._voice_prompt("Akili")
    assert p.startswith("Akili, Mazungumzo")
    assert server._clean_transcript(p, p) == ""
    assert server._clean_transcript("Mazungumzo haya ni kwa Kiswahili na English.", p) == ""
    assert server._clean_transcript("LUKU, DAWASA, TANESCO, M-Pesa, Tigo Pesa, Airtel Money", p) == ""
    # Real speech is kept, even when it uses the prompt's words
    for real in ["Nisaidie kulipa bili ya LUKU leo jioni", "Dar es Salaam", "Kariakoo", "ok",
                 "Reply to this email please"]:
        assert server._clean_transcript(real, p) == real


def test_direct_groq_gets_prompt_and_language(server, fake_http, monkeypatch):
    monkeypatch.setattr(server.settings, "groq_api_key", "gsk_test", raising=False)
    fake_http.reply = {"text": "Nitafutie mkataba wa Kariakoo", "language": "swahili"}
    c = TestClient(server.app)

    r = c.post("/transcribe", files=AUDIO, data={"agent_name": "Akili"})
    assert r.status_code == 200
    assert r.json() == {"text": "Nitafutie mkataba wa Kariakoo", "language": "sw"}
    sent = fake_http.calls[-1]["data"]
    assert sent["prompt"].startswith("Akili, Mazungumzo") and "nTZS" in sent["prompt"]
    assert sent["response_format"] == "verbose_json"
    assert "language" not in sent                      # auto-detect

    c.post("/transcribe", files=AUDIO, data={"language": "en"})
    assert fake_http.calls[-1]["data"]["language"] == "en"
    c.post("/transcribe", files=AUDIO, data={"language": "fr"})   # not offered → auto
    assert "language" not in fake_http.calls[-1]["data"]


def test_proxy_route_forwards_prompt(server, fake_http, monkeypatch):
    monkeypatch.setattr(server.settings, "invite_code", "UBONGO-TEST", raising=False)
    fake_http.reply = {"text": "Reply to this email please"}     # older proxy: no language
    r = TestClient(server.app).post("/transcribe", files=AUDIO, data={"language": "en"})
    assert r.json() == {"text": "Reply to this email please", "language": "en"}
    call = fake_http.calls[-1]
    assert call["url"].endswith("/transcribe") and call["headers"]["x-api-key"] == "UBONGO-TEST"
    assert "Kiswahili na English" in call["data"]["prompt"] and call["data"]["language"] == "en"


def test_voice_before_access_is_set_up(server, fake_http):
    r = TestClient(server.app).post("/transcribe", files=AUDIO)
    assert r.status_code == 503
    assert "setting up" in r.json()["detail"] and "invite" not in r.json()["detail"].lower()
    assert fake_http.calls == []


# ── Proxy ──────────────────────────────────────────────────────────────

def test_proxy_passes_prompt_and_returns_language(monkeypatch, fake_http):
    for k, v in {"ANTHROPIC_API_KEY": "sk-ant-test", "GROQ_API_KEY": "gsk_test"}.items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("VALID_CODES", raising=False)
    sys.path.insert(0, str(Path(__file__).parent / "proxy"))
    try:
        sys.modules.pop("main", None)
        main = importlib.import_module("main")
    finally:
        sys.path.pop(0)
    client = TestClient(main.app)
    code = client.post("/provision", headers={"fly-client-ip": "9.9.9.9"}).json()["code"]

    fake_http.reply = {"text": "Habari ya asubuhi", "language": "swahili"}
    r = client.post("/transcribe", files=AUDIO, data={"prompt": "Habari " * 300},
                    headers={"x-api-key": code})
    assert r.status_code == 200
    assert r.json() == {"text": "Habari ya asubuhi", "language": "swahili"}
    sent = fake_http.calls[-1]["data"]
    assert sent["response_format"] == "verbose_json"
    assert len(sent["prompt"]) == 800                    # capped
    assert os.environ["GROQ_API_KEY"] in fake_http.calls[-1]["headers"]["Authorization"]
