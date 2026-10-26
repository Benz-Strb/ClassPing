from tests.images import noise_image, png


def test_leave_ocr_returns_text_lines(client, auth, reader):
    reader.lines = [('ลาป่วย', 0.98)]
    response = client.post(
        '/leave/ocr',
        headers=auth,
        files={'image': ('leave.png', png(noise_image()), 'image/png')},
    )

    assert response.status_code == 200
    assert response.json()['data'] == {'lines': [{'text': 'ลาป่วย', 'score': 0.98}]}
