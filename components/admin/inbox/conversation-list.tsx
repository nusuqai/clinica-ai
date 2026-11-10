"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  BellRing,
  Globe,
  Inbox,
  Loader2,
  MoreVertical,
  Pin,
  UserRound,
} from "lucide-react";
import { Channel } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FilterBar } from "@/components/ui/filter-bar";
import { WhatsappIcon } from "@/components/icons/whatsapp-icon";
import { usePendingNavigation } from "@/components/general/pending-navigation";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/services/messages";
import type { InboxLabelItem, InboxTeammate } from "@/server/services/inbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LabelChip } from "./labels-dialog";
import { ConversationMenuContent, type ConversationMenuDialog } from "./conversation-menu";

const QUICK_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "الكل" },
  { value: "needs_me", label: "بحاجة لردي" },
  { value: "unread", label: "غير المقروءة" },
  { value: "assigned_me", label: "المسندة إليّ" },
  { value: "pinned", label: "المثبتة" },
  { value: "reminders", label: "التذكيرات" },
  { value: "escalated", label: "المُصعّدة" },
];

function shortTime(d: Date): string {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  }
  return formatDistanceToNow(date, { addSuffix: false, locale: ar });
}

/** The ⋮ on a list row: the same tools as inside the conversation, without
 *  opening it. Always shown on touch screens; on desktop on hover/focus. */
function RowMenu({
  conversation,
  currentUserId,
  teammates,
  canOpenPatientProfile,
  onTogglePin,
  onAssign,
  onOpenDialog,
}: {
  conversation: ConversationSummary;
  currentUserId: string;
  teammates: InboxTeammate[];
  canOpenPatientProfile: boolean;
  onTogglePin: () => void;
  onAssign: (assigneeId: string | null) => void;
  onOpenDialog: (dialog: ConversationMenuDialog) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="أدوات المحادثة"
          className={cn(
            "my-2 me-1 flex w-7 shrink-0 items-start justify-center rounded-lg pt-1 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100",
            "md:opacity-0 md:group-hover:opacity-100",
            open && "bg-muted text-foreground md:opacity-100"
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl p-1.5">
        <ConversationMenuContent
          pinned={conversation.pinned}
          labelCount={conversation.labels.length}
          assignedTo={conversation.assignedTo}
          currentUserId={currentUserId}
          teammates={teammates}
          patientHref={
            canOpenPatientProfile && conversation.userId
              ? `/admin/patients/${conversation.userId}`
              : null
          }
          onTogglePin={onTogglePin}
          onAssign={onAssign}
          onOpenDialog={onOpenDialog}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ConversationList({
  conversations,
  activeId,
  loading,
  labels,
  needsMeCount,
  currentUserId,
  onSelect,
  teammates,
  canOpenPatientProfile,
  onTogglePin,
  onAssign,
  onOpenDialog,
  className,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  labels: InboxLabelItem[];
  needsMeCount: number;
  currentUserId: string;
  onSelect: (id: string) => void;
  teammates: InboxTeammate[];
  canOpenPatientProfile: boolean;
  /** Row ⋮ menu — act on a conversation without opening it. */
  onTogglePin: (conversation: ConversationSummary) => void;
  onAssign: (conversation: ConversationSummary, assigneeId: string | null) => void;
  onOpenDialog: (conversation: ConversationSummary, dialog: ConversationMenuDialog) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nav = usePendingNavigation();
  const show = searchParams.get("show") ?? "";
  const hasFilters = !!(
    searchParams.get("q") ||
    searchParams.get("channel") ||
    searchParams.get("label") ||
    show
  );

  const setShow = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("show", value);
    else params.delete("show");
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (nav) nav.navigate(href, { replace: true });
    else router.replace(href, { scroll: false });
  };

  return (
    <aside className={cn("flex min-h-0 flex-col border-e border-border", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-foreground">المحادثات</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Quick filters — WhatsApp-style chips; the counter is realtime. */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
        {QUICK_FILTERS.map((f) => {
          const active = show === f.value;
          const isNeedsMe = f.value === "needs_me";
          return (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setShow(f.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {f.label}
              {isNeedsMe && needsMeCount > 0 && (
                <span
                  dir="ltr"
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                >
                  {needsMeCount > 99 ? "99+" : needsMeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + channel + my labels — applied in the database. */}
      <div className="border-b border-border px-3 py-2.5">
        <FilterBar
          stacked
          fields={[
            { type: "search", param: "q", placeholder: "بحث بالاسم أو رقم الهاتف..." },
            {
              type: "select",
              param: "channel",
              allLabel: "كل القنوات",
              options: [
                { value: Channel.WHATSAPP, label: "واتساب" },
                { value: Channel.WEB, label: "الموقع" },
              ],
            },
            ...(labels.length
              ? [
                  {
                    type: "select" as const,
                    param: "label",
                    allLabel: "كل التصنيفات",
                    options: labels.map((l) => ({ value: l.id, label: l.name })),
                  },
                ]
              : []),
          ]}
        />
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {conversations.length === 0 && (
          <li className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40" />
            <p className="font-sans text-xs">
              {hasFilters ? "لا توجد محادثات مطابقة" : "لا توجد محادثات بعد"}
            </p>
          </li>
        )}
        {conversations.map((conv) => {
          const active = activeId === conv.id;
          return (
            <li
              key={conv.id}
              className={cn(
                "group relative flex items-stretch transition-colors hover:bg-muted/50",
                conv.hasUnresolvedEscalation && "bg-red-50 dark:bg-red-950/30",
                conv.needsMe && !conv.hasUnresolvedEscalation && "bg-amber-50 dark:bg-amber-950/30",
                conv.needsMe && "border-s-[3px] border-amber-500",
                active && "bg-accent/10 md:border-e-2 md:border-accent"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(conv.id)}
                className="flex min-w-0 flex-1 items-start gap-3 py-3 ps-3 text-start"
              >
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-primary/10 font-sans text-sm font-bold text-primary">
                      {conv.contactName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -end-0.5 rounded-full bg-background p-0.5">
                    {conv.channel === Channel.WHATSAPP ? (
                      <WhatsappIcon className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-accent" />
                    )}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {conv.hasUnresolvedEscalation && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0 text-red-500"
                        aria-label="طلب تصعيد غير محلول"
                      />
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-sans text-sm text-foreground",
                        conv.unreadCount > 0 ? "font-semibold" : "font-medium"
                      )}
                    >
                      {conv.contactName}
                    </span>
                    {conv.lastMessageAt && (
                      <span
                        className={cn(
                          "shrink-0 font-sans text-[10px]",
                          conv.unreadCount > 0 ? "text-accent" : "text-muted-foreground/70"
                        )}
                      >
                        {shortTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>

                  {/* Skip when the name already fell back to the phone itself. */}
                  {conv.contactPhone && conv.contactPhone !== conv.contactName && (
                    <p className="truncate font-sans text-[11px] text-muted-foreground/80">
                      <span dir="ltr">{conv.contactPhone}</span>
                    </p>
                  )}

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-sans text-xs text-muted-foreground">
                      {conv.lastMessage ?? ""}
                    </p>
                    {conv.reminderDue && (
                      <BellRing
                        className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-600"
                        aria-label="تذكير مستحق"
                      />
                    )}
                    {!conv.reminderDue && conv.nextReminderAt && (
                      <AlarmClock
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="تذكير"
                      />
                    )}
                    {conv.pinned && (
                      <Pin
                        className="h-3.5 w-3.5 shrink-0 rotate-45 text-muted-foreground"
                        aria-label="مثبتة"
                      />
                    )}
                    {conv.unreadCount > 0 && (
                      <span
                        dir="ltr"
                        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 font-sans text-[10px] font-bold text-white"
                      >
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {(conv.labels.length > 0 || conv.assignedTo || conv.needsMe) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {conv.needsMe && (
                        <span className="inline-flex items-center rounded-full bg-amber-500 px-1.5 py-px font-sans text-[10px] font-medium text-white">
                          بحاجة لردك
                        </span>
                      )}
                      {conv.assignedTo && (
                        <span
                          className={cn(
                            "inline-flex max-w-[120px] items-center gap-0.5 truncate rounded-full px-1.5 py-px font-sans text-[10px]",
                            conv.assignedTo.id === currentUserId
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          <UserRound className="h-2.5 w-2.5 shrink-0" />
                          {conv.assignedTo.id === currentUserId
                            ? "مسندة إليك"
                            : conv.assignedTo.name}
                        </span>
                      )}
                      {conv.labels.map((l) => (
                        <LabelChip key={l.id} label={l} />
                      ))}
                    </div>
                  )}
                </div>
              </button>
              <RowMenu
                conversation={conv}
                currentUserId={currentUserId}
                teammates={teammates}
                canOpenPatientProfile={canOpenPatientProfile}
                onTogglePin={() => onTogglePin(conv)}
                onAssign={(assigneeId) => onAssign(conv, assigneeId)}
                onOpenDialog={(dialog) => onOpenDialog(conv, dialog)}
              />
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
