"""Tests for automatic code provisioning (POST /provision).

Run: pip install -r proxy/requirements.txt pytest && pytest proxy/test_provision.py
"""
import importlib
import os
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))


def load(monkeypatch, **env):
    for k, v in {"ANTHROPIC_API_KEY": "sk-ant-test", "VALID_CODES": None, "PROVISION_PER_IP_PER_DAY": "2", "PROVISION_DAILY_CAP": "3", **env}.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)
    import main
    return importlib.reload(main)


def test_issues_a_code_the_proxy_then_accepts(monkeypatch):
    main = load(monkeypatch)
    client = TestClient(main.app)
    r = client.post("/provision", headers={"fly-client-ip": "1.1.1.1"})
    assert r.status_code == 200
    code = r.json()["code"]
    assert code.startswith("UBONGO-")
    v = client.post("/validate", json={"code": code})
    assert v.status_code == 200
    assert v.json()["valid"] is True


def test_codes_are_unique(monkeypatch):
    main = load(monkeypatch, PROVISION_PER_IP_PER_DAY="10", PROVISION_DAILY_CAP="10")
    client = TestClient(main.app)
    codes = {client.post("/provision", headers={"fly-client-ip": "2.2.2.2"}).json()["code"] for _ in range(5)}
    assert len(codes) == 5


def test_caps_codes_per_network(monkeypatch):
    main = load(monkeypatch)
    client = TestClient(main.app)
    h = {"fly-client-ip": "3.3.3.3"}
    assert client.post("/provision", headers=h).status_code == 200
    assert client.post("/provision", headers=h).status_code == 200
    assert client.post("/provision", headers=h).status_code == 429
    # A different network is still fine
    assert client.post("/provision", headers={"fly-client-ip": "4.4.4.4"}).status_code == 200


def test_caps_codes_per_day_overall(monkeypatch):
    main = load(monkeypatch, PROVISION_PER_IP_PER_DAY="5")
    client = TestClient(main.app)
    for i in range(3):
        assert client.post("/provision", headers={"fly-client-ip": f"5.5.5.{i}"}).status_code == 200
    r = client.post("/provision", headers={"fly-client-ip": "5.5.5.9"})
    assert r.status_code == 429
    assert "capacity" in r.json()["detail"]


def test_disabled_without_an_anthropic_key(monkeypatch):
    main = load(monkeypatch, ANTHROPIC_API_KEY=None)
    r = TestClient(main.app).post("/provision")
    assert r.status_code == 503


def test_forged_codes_are_rejected(monkeypatch):
    main = load(monkeypatch)
    r = TestClient(main.app).post("/validate", json={"code": "UBONGO-DEADBEEF-000000"})
    assert r.status_code == 401


def test_keys_stop_working_when_the_anthropic_key_changes(monkeypatch):
    main = load(monkeypatch)
    code = TestClient(main.app).post("/provision", headers={"fly-client-ip": "6.6.6.6"}).json()["code"]
    main = load(monkeypatch, ANTHROPIC_API_KEY="sk-ant-rotated")
    assert TestClient(main.app).post("/validate", json={"code": code}).status_code == 401


def test_no_built_in_codes(monkeypatch):
    main = load(monkeypatch)
    r = TestClient(main.app).post("/validate", json={"code": "UBONGO-DEV-0000"})
    assert r.status_code == 401
