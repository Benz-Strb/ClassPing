import { LiveFaces } from './live-faces.js';

const T0 = new Date('2026-10-24T02:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('LiveFaces', () => {
  it('เก็บผลล่าสุดของแต่ละคาบ ทับของเก่า', () => {
    const store = new LiveFaces();
    store.set('s1', T0, [{ box: [0, 0, 0.1, 0.1], userId: 'a', kind: 'match' }]);
    store.set('s1', at(1), [{ box: [0.5, 0.5, 0.6, 0.6], userId: null, kind: 'unknown' }]);
    expect(store.get('s1', at(1))).toEqual({
      at: at(1),
      faces: [{ box: [0.5, 0.5, 0.6, 0.6], userId: null, kind: 'unknown' }],
    });
    expect(store.get('s2', at(1))).toBeNull();
  });

  it('เก่ากว่า 5 วิถือว่าไม่มี (กล้องหยุดส่งแล้ว) และลบทิ้ง', () => {
    const store = new LiveFaces();
    store.set('s1', T0, []);
    expect(store.get('s1', at(5))).not.toBeNull();
    expect(store.get('s1', at(5.1))).toBeNull();
    expect(store.get('s1', at(1))).toBeNull();
  });
});
