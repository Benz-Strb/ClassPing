"use client";

import { confirmAction } from "@/components/notifications";

import { useRouter } from "next/navigation";
import { RetryButton } from "@/components/retry-button";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { AdminUser, Role } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  student: "นักศึกษา",
  teacher: "อาจารย์",
  admin: "ผู้ดูแล",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AdminUser[]>("/admin/users")
      .then(setUsers)
      .catch(async (value: unknown) =>
        setError(await handleApiError(value, router)),
      );
  }, [router]);

  async function changeRole(user: AdminUser, role: Role) {
    setBusyIds((current) => new Set(current).add(user.id));
    setError(null);
    setStatus(null);
    try {
      const updated = await apiFetch<AdminUser>(
        `/admin/users/${user.id}/role`,
        {
          method: "PATCH",
          body: JSON.stringify({ role }),
        },
      );
      setUsers(
        (current) =>
          current?.map((item) => (item.id === user.id ? updated : item)) ??
          null,
      );
      setStatus(`เปลี่ยนบทบาทของ ${user.fullName ?? user.email} แล้ว`);
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function withdrawConsent(user: AdminUser) {
    if (
      !(await confirmAction(
        `ถอนความยินยอมของ ${user.fullName ?? user.email}? ระบบจะลบข้อมูลใบหน้าและความยินยอม และผู้ใช้ต้องให้ความยินยอมใหม่ก่อนลงทะเบียนใบหน้าอีกครั้ง`,
      ))
    )
      return;
    setBusyIds((current) => new Set(current).add(user.id));
    setError(null);
    setStatus(null);
    try {
      await apiFetch(`/users/${user.id}/face?withdraw=1`, { method: "DELETE" });
      setUsers(
        (current) =>
          current?.map((item) =>
            item.id === user.id ? { ...item, hasFace: false } : item,
          ) ?? null,
      );
      setStatus(`ถอนความยินยอมของ ${user.fullName ?? user.email} แล้ว`);
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }

  async function resetFace(user: AdminUser) {
    if (
      !(await confirmAction(`รีเซ็ตใบหน้าของ ${user.fullName ?? user.email} หรือไม่`))
    )
      return;
    setBusyIds((current) => new Set(current).add(user.id));
    setError(null);
    setStatus(null);
    try {
      await apiFetch(`/users/${user.id}/face`, { method: "DELETE" });
      setUsers(
        (current) =>
          current?.map((item) =>
            item.id === user.id ? { ...item, hasFace: false } : item,
          ) ?? null,
      );
      setStatus(`รีเซ็ตใบหน้าของ ${user.fullName ?? user.email} แล้ว`);
    } catch (value) {
      setError(await handleApiError(value, router));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(user.id);
        return next;
      });
    }
  }

  return (
    <section aria-labelledby="users-title" className="admin-users">
      <div className="admin-users-heading">
        <h2 id="users-title">
          ผู้ใช้ทั้งหมด
        </h2>
        {users && <p>{users.length.toLocaleString("th-TH")} คน</p>}
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {users === null ? (
        error ? <RetryButton /> : <p role="status">กำลังโหลดผู้ใช้...</p>
      ) : users.length === 0 ? (
        <p className="text-gray-600">ยังไม่มีผู้ใช้</p>
      ) : (
        <div className="admin-users-table" role="region" aria-labelledby="users-title" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  ผู้ใช้
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  บทบาท
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  ใบหน้า
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} aria-busy={busyIds.has(user.id)}>
                  <td className="px-4 py-3">
                    <span className="admin-users-name">
                      {user.fullName ?? "ไม่ระบุชื่อ"}
                    </span>
                    <span className="admin-users-email">{user.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      บทบาทของ {user.email}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role}
                      disabled={busyIds.has(user.id)}
                      onChange={(event) =>
                        void changeRole(user, event.target.value as Role)
                      }
                      className="admin-users-role"
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="admin-users-status" data-registered={user.hasFace}>
                      {user.hasFace ? "ลงทะเบียนแล้ว" : "ยังไม่ลงทะเบียน"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="admin-users-actions">
                      <button
                        type="button"
                        disabled={!user.hasFace || busyIds.has(user.id)}
                        onClick={() => void resetFace(user)}
                      >
                        รีเซ็ตใบหน้า
                      </button>
                      <button
                        type="button"
                        disabled={busyIds.has(user.id)}
                        onClick={() => void withdrawConsent(user)}
                        className="admin-users-withdraw"
                      >
                        ถอนความยินยอม
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
