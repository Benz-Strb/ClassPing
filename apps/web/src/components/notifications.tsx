"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

type Confirmation = { id: number; message: string; title: string; confirmLabel: string; danger: boolean; resolve: (value: boolean) => void };
type Notice = { id: number; message: string; kind: 'success' | 'error' };
const listeners = new Set<() => void>();
const pending: Confirmation[] = [];
let notices: Notice[] = [];
let nextId = 0;
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getConfirmation = () => pending[0] ?? null;
const getNotices = () => notices;
const emptyNotices: Notice[] = [];

export function confirmAction(message: string, options: { title?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise(resolve => {
    pending.push({ id: ++nextId, message, title: options.title ?? 'ยืนยันการดำเนินการ', confirmLabel: options.confirmLabel ?? 'ยืนยัน', danger: options.danger ?? false, resolve });
    emit();
  });
}
function settle(id: number, confirmed: boolean) {
  if (pending[0]?.id !== id) return;
  pending.shift()!.resolve(confirmed);
  emit();
}
export function notify(message: string, kind: Notice['kind'] = 'success') {
  notices = [...notices, { id: ++nextId, message, kind }];
  emit();
}
function dismiss(id: number) { notices = notices.filter(notice => notice.id !== id); emit(); }
function NoticeItem({ notice }: { notice: Notice }) {
  useEffect(() => {
    if (notice.kind === 'error') return;
    const timer = setTimeout(() => dismiss(notice.id), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  return <div className="notification-toast" data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
    <span className="notification-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" />{notice.kind === 'success' ? <path d="m8 12 3 3 5-6" /> : <path d="M12 7v6m0 3v1" />}</svg></span>
    <div><strong>{notice.kind === 'success' ? 'สำเร็จแล้ว' : 'ดำเนินการไม่สำเร็จ'}</strong><p>{notice.message}</p></div>
    <button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => dismiss(notice.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
  </div>;
}
export function Notifications() {
  const request = useSyncExternalStore(subscribe, getConfirmation, () => null);
  const items = useSyncExternalStore(subscribe, getNotices, () => emptyNotices);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!request) return;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => element?.close();
  }, [request]);
  return <>
    <div className="notification-stack" aria-label="การแจ้งเตือน">{items.map(item => <NoticeItem key={item.id} notice={item} />)}</div>
    <dialog ref={dialog} className="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onCancel={event => { event.preventDefault(); if (request) settle(request.id, false); }}>
      {request && <>
        <div className="confirmation-icon" data-danger={request.danger} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v1" /></svg></div>
        <h2 id="confirmation-title">{request.title}</h2>
        <p id="confirmation-message">{request.message}</p>
        <div className="confirmation-actions"><button ref={cancel} type="button" className="confirmation-cancel" onClick={() => settle(request.id, false)}>ยกเลิก</button><button type="button" className="confirmation-submit" data-danger={request.danger} onClick={() => settle(request.id, true)}>{request.confirmLabel}</button></div>
      </>}
    </dialog>
  </>;
}
