from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class MatchResult:
    best_id: str | None
    score: float | None
    second_id: str | None
    second_score: float | None


def normalize(vectors: np.ndarray) -> np.ndarray:
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def match(probes: np.ndarray, candidates: list[tuple[str, np.ndarray]]) -> list[MatchResult]:
    """เทียบ probe แต่ละหน้ากับรายชื่อ คืนคนที่ใกล้สุดและอันดับสอง

    คะแนนของคนหนึ่ง = cosine similarity สูงสุดเทียบกับทุกมุมที่คนนั้นลงทะเบียนไว้
    คืนอันดับสองด้วย เพื่อให้ API ส่งไปรอตรวจได้ถ้าสองคนคะแนนใกล้กันเกินไป
    """
    if not candidates:
        return [MatchResult(None, None, None, None) for _ in range(len(probes))]

    ids = [candidate_id for candidate_id, _ in candidates]
    owners = np.concatenate([np.full(len(e), i) for i, (_, e) in enumerate(candidates)])
    gallery = normalize(np.concatenate([e for _, e in candidates]).astype(np.float32))
    scores = normalize(probes.astype(np.float32)) @ gallery.T  # (probes, ทุกมุมของทุกคน)

    # รวมเป็นคะแนนต่อคน: เอามุมที่ใกล้สุดของแต่ละคน
    per_person = np.full((len(probes), len(candidates)), -np.inf, dtype=np.float32)
    np.maximum.at(per_person.T, owners, scores.T)

    results = []
    for row in per_person:
        order = np.argsort(-row)
        best = int(order[0])
        second = int(order[1]) if len(order) > 1 else None
        results.append(
            MatchResult(
                best_id=ids[best],
                score=float(row[best]),
                second_id=None if second is None else ids[second],
                second_score=None if second is None else float(row[second]),
            )
        )
    return results
