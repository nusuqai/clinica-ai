"use client";

import { useState } from "react";
import {
  AlarmClock,
  ExternalLink,
  Pin,
  PinOff,
  Tag,
  UserRound,
  UserRoundCheck,
  UserRoundPlus,
  UserRoundX,
} from "lucide-react";
import type { InboxTeammate } from "@/server/services/inbox";
import { TeammatePicker } from "./escalate-dialog";
import { MenuItem } from "./shared";

export type ConversationMenuDialog = "labels" | "reminder" | "escalate";

/**
 * The conversation ⋮ menu body — shared by the thread header and the list row
 * so both always offer the same tools. The caller owns the Popover + trigger
 * (closing the popover unmounts this, which also resets the assign sub-view).
 */
export function ConversationMenuContent({
  pinned,
  labelCount,
  assignedTo,
  reminderCount,
  currentUserId,
  teammates,
  patientHref,
  patientLinkClassName,
  onTogglePin,
  onAssign,
  onOpenDialog,
  onClose,
}: {
  pinned: boolean;
  labelCount: number;
  assignedTo: { id: string; name: string } | null;
  /** Open reminders shown as a hint; omitted when unknown (list rows). */
  reminderCount?: number;
  currentUserId: string;
  teammates: InboxTeammate[];
  /** The linked patient's profile, when the viewer may open it. */
  patientHref?: string | null;
  /** e.g. hide the profile link on desktop where the side panel shows it. */
  patientLinkClassName?: string;
  onTogglePin: () => void;
  onAssign: (assigneeId: string | null) => void;
  onOpenDialog: (dialog: ConversationMenuDialog) => void;
  onClose: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  if (assignOpen) {
    return (
      <div className="space-y-1">
        <p className="px-2 py-1 font-sans text-xs font-medium text-muted-foreground">
          إسناد المحادثة إلى
        </p>
        <TeammatePicker
          teammates={teammates}
          value={assignedTo?.id ?? null}
          onChange={(id) => run(() => onAssign(id))}
        />
        {assignedTo && (
          <MenuItem
            icon={<UserRoundX />}
            label="إلغاء الإسناد"
            destructive
            onClick={() => run(() => onAssign(null))}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <MenuItem
        icon={pinned ? <PinOff /> : <Pin />}
        label={pinned ? "إلغاء التثبيت" : "تثبيت المحادثة"}
        hint="لك فقط"
        onClick={() => run(onTogglePin)}
      />
      <MenuItem
        icon={<Tag />}
        label="التصنيفات"
        hint={labelCount ? String(labelCount) : "لك فقط"}
        onClick={() => run(() => onOpenDialog("labels"))}
      />
      <MenuItem
        icon={<UserRoundCheck />}
        label={assignedTo ? "تغيير الإسناد" : "إسناد لعضو في الفريق"}
        hint={assignedTo ? (assignedTo.id === currentUserId ? "أنت" : assignedTo.name) : undefined}
        onClick={() => setAssignOpen(true)}
      />
      {assignedTo?.id !== currentUserId && (
        <MenuItem
          icon={<UserRound />}
          label="إسنادها إليّ"
          onClick={() => run(() => onAssign(currentUserId))}
        />
      )}
      <MenuItem
        icon={<AlarmClock />}
        label="تذكير بالمراجعة"
        hint={reminderCount ? String(reminderCount) : undefined}
        onClick={() => run(() => onOpenDialog("reminder"))}
      />
      <MenuItem
        icon={<UserRoundPlus />}
        label="تصعيد إلى زميل"
        onClick={() => run(() => onOpenDialog("escalate"))}
      />
      {patientHref && (
        <a
          href={patientHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-sans text-sm hover:bg-muted [&_svg]:size-4 ${patientLinkClassName ?? ""}`}
        >
          <UserRound />
          ملف العميل
          <ExternalLink className="ms-auto !size-3 opacity-60" />
        </a>
      )}
    </>
  );
}
