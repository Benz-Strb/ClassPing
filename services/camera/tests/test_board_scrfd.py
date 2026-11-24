import numpy as np

from camera.board.scrfd import decode
from tests.board_fakes import face_kps, fake_outputs

H, W = 128, 160
BOX = (40.0, 30.0, 104.0, 94.0)


def test_decode_finds_one_face():
    kps = face_kps(BOX)
    found = decode(fake_outputs(H, W, [(BOX, kps, 0.9)], shuffle=True), H, W)
    assert len(found) == 1
    assert np.allclose(found[0].bbox, BOX, atol=0.5)
    assert np.allclose(found[0].kps, kps, atol=0.5)
    assert found[0].kps.shape == (5, 2)
    assert abs(found[0].score - 0.9) < 1e-6


def test_decode_drops_low_score():
    assert decode(fake_outputs(H, W, [(BOX, face_kps(BOX), 0.49)]), H, W) == []


def test_decode_merges_overlaps():
    near = (42.0, 32.0, 106.0, 96.0)
    faces = [(BOX, face_kps(BOX), 0.9), (near, face_kps(near), 0.8)]
    found = decode(fake_outputs(H, W, faces), H, W)
    assert len(found) == 1
    assert abs(found[0].score - 0.9) < 1e-6


def test_decode_empty_returns_list():
    assert decode(fake_outputs(H, W, []), H, W) == []
