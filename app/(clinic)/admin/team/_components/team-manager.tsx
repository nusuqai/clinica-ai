"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Role } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { PERMISSIONS, PERMISSION_META, type Permission } from "@/lib/permissions";
import {
  changeTeamMemberRoleAction,
  createRoleAction,
  deleteRoleAction,
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateRoleAction,
} from "@/server/actions/team";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberView {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  clinicRoleId: string | null;
  clinicRoleName: string | null;
  joinedAt: string;
}

export interface TeamRoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  memberCount: number;
}

interface TeamManagerProps {
  members: TeamMemberView[];
  roles: TeamRoleView[];
  currentUserId: string;
}

// The <select> value for "clinic admin" — every other value is a custom role id.
const ADMIN_VALUE = "admin";

const inputClass =
  "w-full rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const primaryButton =
  "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50";
const ghostButton =
  "rounded-xl border border-border px-4 py-2 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
      {message}
    </div>
  );
}

export default function TeamManager({ members, roles, currentUserId }: TeamManagerProps) {
  const [tab, setTab] = useState<"members" | "roles">("members");

  const tabs = [
    { key: "members" as const, label: "الأعضاء", icon: Users, count: members.length },
    { key: "roles" as const, label: "الأدوار والصلاحيات", icon: ShieldCheck, count: roles.length },
  ];

  return (
    <div>
      <div className="mb-5 inline-flex rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-sans text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span
              className={[
                "rounded-full px-1.5 text-xs",
                tab === t.key ? "bg-white/20" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "members" ? (
        <MembersTab members={members} roles={roles} currentUserId={currentUserId} />
      ) : (
        <RolesTab roles={roles} />
      )}
    </div>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────

function RoleOptions({ roles }: { roles: TeamRoleView[] }) {
  return (
    <>
      <option value={ADMIN_VALUE}>مدير العيادة (كل الصلاحيات)</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </>
  );
}

function MembersTab({ members, roles, currentUserId }: TeamManagerProps) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeRole(userId: string, assignment: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await changeTeamMemberRoleAction(userId, assignment);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  function remove(member: TeamMemberView) {
    if (!confirm(`إزالة «${member.fullName}» من فريق العيادة؟ سيفقد الوصول إلى لوحة التحكم.`))
      return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await removeTeamMemberAction(member.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-muted-foreground">
          مدراء العيادة وموظفوها. الأطباء يُدارون من صفحة «الأطباء».
        </p>
        <button onClick={() => setInviteOpen(true)} className={primaryButton}>
          <UserPlus className="h-4 w-4" />
          إضافة عضو
        </button>
      </div>

      <ErrorBox message={error} />
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  البريد الإلكتروني
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">الدور</th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  تاريخ الانضمام
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const isSelf = m.id === currentUserId;
                const value = m.role === Role.ADMIN ? ADMIN_VALUE : (m.clinicRoleId ?? "");
                return (
                  <tr key={m.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {m.fullName || "—"}
                      {isSelf && (
                        <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          أنت
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {m.email || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={value}
                        disabled={isSelf || isPending}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
                      >
                        {/* A staff member whose role was deleted: no access until reassigned. */}
                        {value === "" && (
                          <option value="" disabled>
                            بدون دور
                          </option>
                        )}
                        <RoleOptions roles={roles} />
                      </select>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(m.joinedAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => remove(m)}
                        disabled={isSelf || isPending}
                        title={isSelf ? "لا يمكنك إزالة نفسك" : "إزالة من الفريق"}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        إزالة
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        roles={roles}
        onClose={() => setInviteOpen(false)}
        onDone={(msg) => {
          setInviteOpen(false);
          setNotice(msg);
          router.refresh();
        }}
      />
    </div>
  );
}

function InviteModal({
  open,
  roles,
  onClose,
  onDone,
}: {
  open: boolean;
  roles: TeamRoleView[];
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [assignment, setAssignment] = useState(roles[0]?.id ?? ADMIN_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteTeamMemberAction({ fullName, email, assignment });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFullName("");
      setEmail("");
      onDone(res.notice ?? "تمت إضافة العضو");
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="إضافة عضو إلى الفريق">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox message={error} />

        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">الاسم الكامل</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">البريد الإلكتروني</label>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">الدور</label>
          <select
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
            className={inputClass}
          >
            <RoleOptions roles={roles} />
          </select>
          {assignment === ADMIN_VALUE && (
            <p className="font-sans text-xs text-amber-700">
              مدير العيادة يملك كل الصلاحيات، ويستطيع إدارة الفريق والأدوار.
            </p>
          )}
        </div>

        <p className="font-sans text-xs text-muted-foreground">
          سيصله بريد إلكتروني لتعيين كلمة المرور. إن كان لديه حساب بالفعل فسيُضاف مباشرةً ويسجّل
          الدخول بحسابه الحالي.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ghostButton}>
            إلغاء
          </button>
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? "جارٍ الإضافة…" : "إضافة العضو"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Roles ────────────────────────────────────────────────────────────────────

function RolesTab({ roles }: { roles: TeamRoleView[] }) {
  const router = useRouter();
  // null = closed, "new" = create, otherwise the role being edited.
  const [editing, setEditing] = useState<TeamRoleView | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(role: TeamRoleView) {
    if (!confirm(`حذف الدور «${role.name}»؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteRoleAction(role.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-sm text-muted-foreground">
          كل دور يحدّد الأقسام التي يستطيع صاحبه إدارتها. مدير العيادة يملك كل الصلاحيات دائماً.
        </p>
        <button onClick={() => setEditing("new")} className={primaryButton}>
          <Plus className="h-4 w-4" />
          دور جديد
        </button>
      </div>

      <ErrorBox message={error} />

      {roles.length === 0 && (
        <div className="rounded-2xl border border-border bg-card py-12 text-center font-sans text-muted-foreground">
          لا توجد أدوار بعد — أنشئ أول دور لتتمكن من إضافة موظفين.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-bold text-foreground">{role.name}</h3>
                {role.description && (
                  <p className="mt-0.5 font-sans text-sm text-muted-foreground">
                    {role.description}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  onClick={() => setEditing(role)}
                  title="تعديل"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(role)}
                  disabled={isPending || role.memberCount > 0}
                  title={role.memberCount > 0 ? "انقل أعضاء هذا الدور إلى دور آخر قبل حذفه" : "حذف"}
                  className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {role.permissions.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-sans text-xs font-medium text-primary"
                >
                  <Check className="h-3 w-3" />
                  {PERMISSION_META[p].label}
                </span>
              ))}
            </div>

            <p className="mt-3 font-sans text-xs text-muted-foreground">
              {role.memberCount === 0 ? "لا يوجد أعضاء بهذا الدور" : `${role.memberCount} عضو`}
            </p>
          </div>
        ))}
      </div>

      {editing && (
        <RoleModal
          // Remount per role so the form state starts from that role's values.
          key={editing === "new" ? "new" : editing.id}
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function RoleModal({
  role,
  onClose,
  onDone,
}: {
  role: TeamRoleView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(p: Permission) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = { name, description, permissions: [...selected] };
    startTransition(async () => {
      const res = role ? await updateRoleAction(role.id, input) : await createRoleAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Modal open onClose={onClose} title={role ? "تعديل الدور" : "دور جديد"} width="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <ErrorBox message={error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">اسم الدور</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: استقبال"
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="font-sans text-sm font-medium text-foreground">
              الوصف <span className="text-muted-foreground">(اختياري)</span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-sans text-sm font-medium text-foreground">الصلاحيات</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((p) => {
              const checked = selected.has(p);
              return (
                <label
                  key={p}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p)}
                    className="mt-1 h-4 w-4 flex-shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-sans text-sm font-medium text-foreground">
                      {PERMISSION_META[p].label}
                    </span>
                    <span className="mt-0.5 block font-sans text-xs leading-relaxed text-muted-foreground">
                      {PERMISSION_META[p].description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {role && role.memberCount > 0 && (
          <p className="font-sans text-xs text-amber-700">
            التغيير يُطبَّق فوراً على {role.memberCount} عضو يحمل هذا الدور.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ghostButton}>
            إلغاء
          </button>
          <button type="submit" disabled={isPending} className={primaryButton}>
            {isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
