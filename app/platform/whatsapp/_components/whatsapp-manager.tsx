"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import ConnectionConfig from "./connection-config";
import TemplatesList from "./templates-list";
// Imported but not rendered — the template composer was already commented out on
// the clinic page this moved from, and stays dormant here. Kept wired so it can
// be switched on without rediscovering how it hooks up.
import CreateTemplate from "./create-template";

interface Props {
  clinicId: string;
  config: WhatsappConfigStatus | null;
  /** Public base URL, used to build this clinic's unique webhook URL. */
  appUrl: string;
}

/**
 * One clinic's WhatsApp panel on the platform console. Collapsed by default:
 * the page lists every clinic, and the credentials form plus template list are
 * far too tall to render for all of them at once.
 */
export default function WhatsappManager({ clinicId, config, appUrl }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings2 className="h-4 w-4" />
        {open ? "إخفاء الإعدادات" : config ? "إدارة الاتصال والقوالب" : "إعداد واتساب لهذه العيادة"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          <ConnectionConfig clinicId={clinicId} initialConfig={config} appUrl={appUrl} />
          {/* <CreateTemplate clinicId={clinicId} disabled={!config} /> */}
          <TemplatesList clinicId={clinicId} disabled={!config} />
        </div>
      )}
    </div>
  );
}
