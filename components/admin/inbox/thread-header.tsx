"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Bot,
  BotOff,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  MoreVertical,
  Phone,
  Pin,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Channel } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { WhatsappIcon } from "@/components/icons/whatsapp-icon";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { cn } from "@/lib/utils";
import {
  assignConversation,
  completeReminder,
  resolveStaffAlert,
  setConversationPinned,
} from "@/server/actions/inbox";
import type { ConversationDetail } from "@/server/services/messages";
import type { InboxLabelItem, InboxTeammate } from "@/server/services/inbox";
import { LabelChip } from "./labels-dialog";
import { formatDateTime } from "./shared";
import { ConversationMenuContent, type ConversationMenuDialog } from "./conversation-menu";

export type ThreadDialog = ConversationMenuDialog | null;

export function ThreadHeader({
  detail,
  labels,
  teammates,
  currentUserId,
  canOpenPatientProfile,
  aiTogglePending,
  onToggleAi,
  onBack,
  onOpenDialog,
  onChanged,
  onDetailPatch,
}: {
  detail: ConversationDetail;
  labels: InboxLabelItem[];
  teammates: InboxTeammate[];
  currentUserId: string;
  canOpenPatientProfile: boolean;
  aiTogglePending: boolean;
  onToggleAi: () => void;
  /** Mobile: back to the list. */
  onBack: () => void;
  onOpenDialog: (d: Exclude<ThreadDialog, null>) => void;
  /** Server state changed — reload the conversation + list. */
  onChanged: () => void;
  /** Optimistic local patch. */
  onDetailPatch: (patch: Partial<ConversationDetail>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const myLabels = labels.filter((l) => detail.labelIds.includes(l.id));
  const unresolved = detail.escalations.filter((e) => !e.resolvedAt);

  const togglePin = () => {
    const next = !detail.pinned;
    onDetailPatch({ pinned: next });
    startTransition(async () => {
      const res = await setConversationPinned(detail.id, next);
      if (!res.ok) {
        onDetailPatch({ pinned: !next });
        toast.error("تعذّر تثبيت المحادثة");
      }
      onChanged();
    });
  };

  const assign = (assigneeId: string | null) => {
    const name = assigneeId ? teammates.find((t) => t.id === assigneeId)?.fullName : null;
    onDetailPatch({ assignedTo: assigneeId ? { id: assigneeId, name: name ?? "" } : null });
    startTransition(async () => {
      const res = await assignConversation(detail.id, assigneeId);
      if (!res.ok) toast.error(res.error === "forbidden" ? "غير مسموح" : res.error);
      else if (assigneeId) toast.success(`تم الإسناد إلى ${name ?? "الزميل"}`);
      onChanged();
    });
  };

  const act = (fn: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error("تعذّر تنفيذ الإجراء");
      onChanged();
    });

  const myAlerts = detail.staffAlerts.filter((a) => a.recipientId === currentUserId);
  const otherAlerts = detail.staffAlerts.filter(
    (a) => a.recipientId !== currentUserId && a.kind === "ESCALATION"
  );
  const dueReminders = detail.reminders.filter((r) => new Date(r.dueAt).getTime() <= Date.now());

  return (
    <div className="flex-shrink-0 border-b border-border">
      <div className="flex items-center gap-2 px-2 py-2 md:gap-3 md:px-5 md:py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="رجوع إلى المحادثات"
          className="shrink-0 md:hidden [&_svg]:size-5"
        >
          <ArrowRight />
        </Button>
        <Avatar className="h-9 w-9 shrink-0 rounded-full">
          <AvatarFallback className="bg-accent/20 font-sans text-xs font-bold text-accent">
            {detail.contactName.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-sans text-sm font-medium text-foreground">
            <span className="truncate">{detail.contactName}</span>
            {detail.pinned && <Pin className="h-3 w-3 shrink-0 rotate-45 text-muted-foreground" />}
            {detail.channel === Channel.WHATSAPP ? (
              <WhatsappIcon className="h-3.5 w-3.5 shrink-0 text-green-500 md:hidden" />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-accent md:hidden" />
            )}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            {detail.contactPhone && (
              <p
                className="flex shrink-0 items-center gap-1 font-sans text-xs text-muted-foreground"
                dir="ltr"
              >
                <Phone className="h-3 w-3" />
                {detail.contactPhone}
              </p>
            )}
            {detail.assignedTo && (
              <span className="flex min-w-0 items-center gap-1 truncate font-sans text-[11px] text-primary">
                <UserRoundCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {detail.assignedTo.id === currentUserId ? "مسندة إليك" : detail.assignedTo.name}
                </span>
              </span>
            )}
          </div>
          {myLabels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {myLabels.map((l) => (
                <LabelChip key={l.id} label={l} />
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {canOpenPatientProfile && detail.userId && (
            <Hint label="فتح ملف العميل في تبويب جديد">
              <Button
                asChild
                variant="ghost"
                className="hidden h-auto gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-normal text-primary hover:bg-primary/20 hover:text-primary md:inline-flex [&_svg]:size-3.5"
              >
                <a
                  href={`/admin/patients/${detail.userId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <UserRound className="h-3.5 w-3.5" />
                  ملف العميل
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </Hint>
          )}
          {detail.escalations.length > 0 && (
            <Hint
              label={(unresolved.length ? unresolved : detail.escalations)
                .map((e) =>
                  e.resolvedByName
                    ? `${escalationReasonLabel(e.reason)} — عالجه: ${e.resolvedByName}`
                    : escalationReasonLabel(e.reason)
                )
                .join(" · ")}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px]",
                  unresolved.length
                    ? "bg-red-100 text-red-700"
                    : "hidden text-muted-foreground md:inline-flex"
                )}
              >
                {unresolved.length > 0 && <AlertTriangle className="h-3 w-3" />}
                <span className={unresolved.length ? "hidden md:inline" : ""}>
                  {unresolved.length
                    ? `${unresolved.length} طلب تصعيد بانتظار الرد`
                    : `${detail.escalations.length} طلب تصعيد (تم الرد)`}
                </span>
              </span>
            </Hint>
          )}
          {detail.activeSessionId && (
            <Hint
              label={
                detail.aiToggledByName
                  ? `${detail.aiEnabled ? "فعّله" : "أوقفه"}: ${detail.aiToggledByName}`
                  : "تفعيل/إيقاف رد المساعد الذكي لهذه الجلسة"
              }
            >
              <Badge
                asChild
                variant={detail.aiEnabled ? "accent" : "muted"}
                className="cursor-pointer gap-1.5 py-1 font-normal disabled:opacity-50"
              >
                <button onClick={onToggleAi} disabled={aiTogglePending}>
                  {detail.aiEnabled ? (
                    <Bot className="h-3.5 w-3.5" />
                  ) : (
                    <BotOff className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden md:inline">
                    {detail.aiEnabled ? "الذكاء مفعّل" : "الذكاء متوقف"}
                  </span>
                </button>
              </Badge>
            </Hint>
          )}
          {detail.channel === Channel.WHATSAPP ? (
            <Badge className="hidden bg-green-100 px-2 font-normal text-green-700 md:inline-flex">
              <WhatsappIcon className="h-3 w-3" />
              واتساب
            </Badge>
          ) : (
            <Badge variant="accent" className="hidden px-2 font-normal md:inline-flex">
              <Globe className="h-3 w-3" />
              ويب
            </Badge>
          )}

          {/* Conversation tools */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="أدوات المحادثة"
                className="[&_svg]:size-5"
              >
                <MoreVertical />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 rounded-2xl p-1.5">
              <ConversationMenuContent
                pinned={detail.pinned}
                labelCount={myLabels.length}
                assignedTo={detail.assignedTo}
                reminderCount={detail.reminders.length}
                currentUserId={currentUserId}
                teammates={teammates}
                patientHref={
                  canOpenPatientProfile && detail.userId ? `/admin/patients/${detail.userId}` : null
                }
                // Desktop shows the profile in the side panel.
                patientLinkClassName="md:hidden"
                onTogglePin={togglePin}
                onAssign={assign}
                onOpenDialog={onOpenDialog}
                onClose={() => setMenuOpen(false)}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Banners: what's waiting on me, colleague escalations, due reminders. */}
      {(myAlerts.length > 0 || otherAlerts.length > 0 || dueReminders.length > 0) && (
        <div className="space-y-1.5 px-3 pb-2 md:px-5">
          {myAlerts.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40"
            >
              {a.kind === "ESCALATION" ? (
                <UserRoundPlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              ) : (
                <UserRoundCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              )}
              <div className="min-w-0 flex-1 font-sans text-xs text-amber-900 dark:text-amber-100">
                <p className="font-medium">
                  {a.kind === "ESCALATION"
                    ? `${a.actorName ?? "زميل"} صعّد هذه المحادثة إليك`
                    : `${a.actorName ?? "زميل"} أسند هذه المحادثة إليك`}
                  {a.messageId && (
                    <button
                      type="button"
                      className="ms-1 underline"
                      onClick={() =>
                        document
                          .getElementById(`msg-${a.messageId}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      (عرض الرسالة)
                    </button>
                  )}
                </p>
                {a.note && <p className="mt-0.5 whitespace-pre-wrap">{a.note}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(() => resolveStaffAlert(a.id))}
                className="h-7 shrink-0 border-amber-400 bg-transparent px-2 text-amber-800 hover:bg-amber-100"
              >
                <Check />
                تم
              </Button>
            </div>
          ))}
          {otherAlerts.map((a) => (
            <p
              key={a.id}
              className="flex items-center gap-1.5 font-sans text-[11px] text-muted-foreground"
            >
              <UserRoundPlus className="h-3 w-3 shrink-0" />
              <span className="truncate">
                مُصعّدة إلى {a.recipientName}
                {a.actorName ? ` بواسطة ${a.actorName}` : ""}
                {a.note ? ` — ${a.note}` : ""}
              </span>
            </p>
          ))}
          {dueReminders.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 dark:border-sky-800 dark:bg-sky-950/40"
            >
              <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div className="min-w-0 flex-1 font-sans text-xs text-sky-900 dark:text-sky-100">
                <p className="font-medium">
                  تذكير مستحق · {formatDateTime(r.dueAt)}
                  {r.createdById !== currentUserId && ` · ${r.createdByName}`}
                </p>
                {r.note && <p className="mt-0.5 whitespace-pre-wrap">{r.note}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act(() => completeReminder(r.id))}
                className="h-7 shrink-0 border-sky-400 bg-transparent px-2 text-sky-800 hover:bg-sky-100"
              >
                <Check />
                تمت المراجعة
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
