import { ViewerSessions } from './viewer-sessions.js';

describe('ViewerSessions', () => {
  it('จำว่าสายไหนเป็นของคาบไหน', () => {
    const viewers = new ViewerSessions();
    viewers.bind('v1', 's1');
    expect(viewers.sessionOf('v1')).toBe('s1');
    expect(viewers.sessionOf('v2')).toBeUndefined();
  });

  it('ลบสายที่หายไปจากรายการ แต่ไม่ลบสายที่ผูกหลังเริ่มดึงรายการ', () => {
    const viewers = new ViewerSessions();
    viewers.bind('gone', 's1');
    viewers.bind('alive', 's1');
    const mark = viewers.mark();
    viewers.bind('new', 's1');
    viewers.prune(new Set(['alive']), mark);
    expect(viewers.sessionOf('gone')).toBeUndefined();
    expect(viewers.sessionOf('alive')).toBe('s1');
    expect(viewers.sessionOf('new')).toBe('s1');
  });
});
