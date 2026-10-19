import numpy as np
import pytest

from app.matching import match
from tests.conftest import unit_vector


def near(vector: np.ndarray, seed: int, amount: float = 0.1) -> np.ndarray:
    """เวกเตอร์ที่ใกล้ vector (จำลองรูปอีกใบของคนเดิม)"""
    mixed = vector + amount * unit_vector(seed)
    return mixed / np.linalg.norm(mixed)


A, B, C = unit_vector(1), unit_vector(2), unit_vector(3)


def test_match_picks_closest():
    [result] = match(np.array([near(B, 10)]), [("a", np.array([A])), ("b", np.array([B]))])
    assert result.best_id == "b"
    assert result.score > 0.9
    assert result.second_id == "a"
    assert result.second_score < 0.3


def test_match_uses_best_of_multiple_embeddings():
    # คน a มีหลายมุม มุมที่สองตรงกับ probe
    [result] = match(np.array([near(C, 11)]), [("a", np.array([A, C])), ("b", np.array([B]))])
    assert result.best_id == "a"
    assert result.score > 0.9


def test_match_multiple_probes_keep_order():
    results = match(
        np.array([near(A, 12), near(B, 13)]), [("a", np.array([A])), ("b", np.array([B]))]
    )
    assert [r.best_id for r in results] == ["a", "b"]


def test_match_normalizes_inputs():
    [result] = match(np.array([B * 5]), [("b", np.array([B * 0.2]))])
    assert result.score == pytest.approx(1.0, abs=1e-5)


def test_match_single_candidate_second_null():
    [result] = match(np.array([A]), [("a", np.array([A]))])
    assert result.best_id == "a"
    assert result.second_id is None
    assert result.second_score is None


def test_match_empty_candidates():
    [result] = match(np.array([A]), [])
    assert (result.best_id, result.score, result.second_id, result.second_score) == (
        None,
        None,
        None,
        None,
    )


# --- HTTP ---


def body(probes, candidates):
    return {
        "probes": [p.tolist() for p in probes],
        "candidates": [{"id": i, "embeddings": [e.tolist() for e in es]} for i, es in candidates],
    }


def test_match_endpoint(client, auth):
    res = client.post(
        "/faces/match", headers=auth, json=body([near(A, 14)], [("a", [A]), ("b", [B])])
    )
    assert res.status_code == 200, res.text
    [result] = res.json()["data"]["results"]
    assert result["bestId"] == "a"
    assert result["secondId"] == "b"
    assert result["score"] > result["secondScore"]


def test_match_endpoint_empty_candidates(client, auth):
    res = client.post("/faces/match", headers=auth, json=body([A], []))
    assert res.json() == {
        "data": {
            "results": [{"bestId": None, "score": None, "secondId": None, "secondScore": None}]
        }
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"probes": [[0.1] * 128], "candidates": []},  # ขนาดผิด
        {"probes": [A.tolist()], "candidates": [{"id": "a", "embeddings": [[0.1] * 511]}]},
        {"probes": [[0.0] * 512], "candidates": []},  # เวกเตอร์ศูนย์ normalize ไม่ได้
        {"probes": [A.tolist()], "candidates": [{"id": "a", "embeddings": []}]},
        {"probes": [], "candidates": []},
    ],
)
def test_match_rejects_bad_embedding(client, auth, payload):
    res = client.post("/faces/match", headers=auth, json=payload)
    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "BAD_EMBEDDING"


def test_match_rejects_nan_literal(client, auth):
    # JSON มาตรฐานไม่มี NaN แต่ Python ส่งได้ ต้องไม่ทำให้ระบบล่ม
    raw = '{"probes": [[NaN' + ", 0.1" * 511 + ']], "candidates": []}'
    res = client.post(
        "/faces/match", headers={**auth, "Content-Type": "application/json"}, content=raw
    )
    assert res.status_code in (400, 422)
    assert res.json()["error"]["code"] in ("BAD_REQUEST", "BAD_EMBEDDING")


@pytest.mark.parametrize(
    "payload",
    [
        {"probes": [A.tolist()] * 51, "candidates": []},
        {
            "probes": [A.tolist()],
            "candidates": [{"id": str(i), "embeddings": [A.tolist()]} for i in range(501)],
        },
        {"probes": [A.tolist()], "candidates": [{"id": "a", "embeddings": [A.tolist()] * 11}]},
    ],
)
def test_match_rejects_too_many(client, auth, payload):
    res = client.post("/faces/match", headers=auth, json=payload)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "TOO_MANY_ITEMS"


def test_match_requires_token(client):
    res = client.post("/faces/match", json=body([A], []))
    assert res.status_code == 401
