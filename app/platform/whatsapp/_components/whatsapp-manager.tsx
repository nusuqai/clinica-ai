"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import {
  disconnectClinicEvolutionAction,
  getClinicEvolutionStatusAction,
  getClinicNumberRemovalImpactAction,
  setClinicNumberBranchAction,
  setClinicPrimaryNumberAction,
  startClinicEvolutionAction,
  stopClinicEvolutionHistoryAction,
  syncClinicEvolutionHistoryAction,
} from "@/server/actions/platformWhatsapp";
import ConnectionConfig from "./connection-config";
import type { WhatsappNumberActions } from "@/components/admin/whatsapp/evolution-connection";
import WhatsappNumbers, { MakePrimaryButton } from "@/components/admin/whatsapp/whatsapp-numbers";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplatesList from "./templates-list";
// Imported but not rendered — the template composer was already commented out on
// the clinic page this moved from, and stays dormant here. Kept wired so it can
// be switched on without rediscovering how it hooks up.
import CreateTemplate from "./create-template";

interface Props {
  clinicId: string;
  /** All of the clinic's numbers, main first. */
  numbers: WhatsappConfigStatus[];
  /** The clinic's branches — possible owners of a number. */
  branches: { id: string; name: string }[];
  /** Public base URL, used to build the official number's webhook URL. */
  appUrl: string;
}

type Provider = WhatsappConfigStatus["provider"];

/**
 * One clinic's WhatsApp panel on the platform console. Collapsed by default:
 * the page lists every clinic, and the forms are far too tall to render for all
 * of them at once.
 *
 * A clinic can have one official Cloud API number (Meta — set up here) and any
 * number of WhatsApp Web numbers (Evolution — linked by QR, here or by the
 * clinic itself). Two tabs, one per kind.
 */
export default function WhatsappManager({ clinicId, numbers, branches, appUrl }: Props) {
  const [open, setOpen] = useState(false);
  const official = numbers.find((n) => n.provider === "META_CLOUD") ?? null;
  const [tab, setTab] = useState<Provider>(
    numbers.some((n) => n.provider === "EVOLUTION") && !official ? "EVOLUTION" : "META_CLOUD"
  );

  const numberActions = useMemo<WhatsappNumberActions>(
    () => ({
      start: (configId, phone, branchId) =>
        startClinicEvolutionAction({ clinicId, configId, phone, branchId }),
      status: (configId) => getClinicEvolutionStatusAction({ clinicId, configId }),
      sync: (configId, mode) => syncClinicEvolutionHistoryAction({ clinicId, configId, mode }),
      stopSync: (configId) => stopClinicEvolutionHistoryAction({ clinicId, configId }),
      disconnect: (configId) => disconnectClinicEvolutionAction({ clinicId, configId }),
      setPrimary: (configId) => setClinicPrimaryNumberAction({ clinicId, configId }),
      impact: (configId) => getClinicNumberRemovalImpactAction({ clinicId, configId }),
      setBranch: (configId, branchId) =>
        setClinicNumberBranchAction({ clinicId, configId, branchId }),
    }),
    [clinicId]
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings2 />
          {open
            ? "إخفاء الإعدادات"
            : numbers.length > 0
              ? "إدارة الأرقام"
              : "إعداد واتساب لهذه العيادة"}
          <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4 border-t border-border pt-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Provider)} dir="rtl">
          <TabsList className="mb-4">
            <TabsTrigger value="META_CLOUD">الرسمي (Cloud API)</TabsTrigger>
            <TabsTrigger value="EVOLUTION">واتساب ويب (Evolution)</TabsTrigger>
          </TabsList>
          <TabsContent value="META_CLOUD">
            <div className="space-y-5">
              {official && !official.isPrimary && (
                <MakePrimaryButton configId={official.id} setPrimary={numberActions.setPrimary} />
              )}
              <ConnectionConfig clinicId={clinicId} initialConfig={official} appUrl={appUrl} />
              {/* <CreateTemplate clinicId={clinicId} disabled={!official} /> */}
              <TemplatesList clinicId={clinicId} disabled={!official} />
            </div>
          </TabsContent>
          <TabsContent value="EVOLUTION">
            <WhatsappNumbers
              numbers={numbers}
              actions={numberActions}
              owners={[{ id: null, name: "العيادة (كل الفروع)" }, ...branches]}
              canSetPrimary
            />
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
