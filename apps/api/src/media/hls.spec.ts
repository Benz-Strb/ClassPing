import { hlsPlaylist, hlsSegments } from './hls.js';

describe('hlsSegments', () => {
  it('แบ่งท่อนละ 6 วินาที ท่อนสุดท้ายเท่าที่เหลือ', () => {
    expect(hlsSegments(14)).toEqual([
      { offset: 0, length: 6 },
      { offset: 6, length: 6 },
      { offset: 12, length: 2 },
    ]);
    expect(hlsSegments(2976)).toHaveLength(496);
  });

  it('ท่อนสุดท้ายสั้นไม่ถึง 1 วินาที รวมกับท่อนก่อนหน้า', () => {
    expect(hlsSegments(12.5)).toEqual([
      { offset: 0, length: 6 },
      { offset: 6, length: 6.5 },
    ]);
  });

  it('คลิปสั้นกว่า 1 วินาทียังได้ 1 ท่อน', () => {
    expect(hlsSegments(0.5)).toEqual([{ offset: 0, length: 0.5 }]);
  });
});

describe('hlsPlaylist', () => {
  it('เป็น VOD มี init และทุกท่อนครบ', () => {
    expect(hlsPlaylist(12.5).split('\n')).toEqual([
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      '#EXT-X-TARGETDURATION:7',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:6.000,',
      'seg/0',
      '#EXTINF:6.500,',
      'seg/1',
      '#EXT-X-ENDLIST',
      '',
    ]);
  });
});
