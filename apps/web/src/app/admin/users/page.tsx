"use client";

import { useRouter } from "next/navigation";
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

  async function resetFace(user: AdminUser) {
    if (
      !window.confirm(`รีเซ็ตใบหน้าของ ${user.fullName ?? user.email} หรือไม่`)
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
    <section aria-labelledby="users-title" className="space-y-4">
      <div>
        <h2 id="users-title" className="text-xl font-semibold">
          ผู้ใช้ทั้งหมด
        </h2>
        <p className="text-sm text-gray-600">
          เปลี่ยนบทบาทและรีเซ็ตการลงทะเบียนใบหน้า
        </p>
      </div>
      {error && (
        <p className="text-red-700" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {users === null ? (
        <p role="status">กำลังโหลดผู้ใช้...</p>
      ) : users.length === 0 ? (
        <p className="text-gray-600">ยังไม่มีผู้ใช้</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y text-left text-sm">
            <thead className="bg-gray-50">
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
            <tbody className="divide-y bg-white">
              {users.map((user) => (
                <tr key={user.id} aria-busy={busyIds.has(user.id)}>
                  <td className="px-4 py-3">
                    <span className="block font-medium">
                      {user.fullName ?? "ไม่ระบุชื่อ"}
                    </span>
                    <span className="text-gray-600">{user.email}</span>
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
                      className="rounded-md border px-2 py-1.5 disabled:opacity-50"
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {user.hasFace ? "ลงทะเบียนแล้ว" : "ยังไม่ลงทะเบียน"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={!user.hasFace || busyIds.has(user.id)}
                      onClick={() => void resetFace(user)}
                      className="rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      รีเซ็ตใบหน้า
                    </button>
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
