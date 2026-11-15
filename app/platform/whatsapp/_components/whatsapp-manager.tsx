"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import ConnectionConfig from "./connection-config";
import EvolutionConnection from "./evolution-connection";
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
  config: WhatsappConfigStatus | null;
  /** Public base URL, used to build this clinic's unique webhook URL. */
  appUrl: string;
}

type Provider = WhatsappConfigStatus["provider"];

/**
 * One clinic's WhatsApp panel on the platform console. Collapsed by default:
 * the page lists every clinic, and the forms are far too tall to render for all
 * of them at once.
 *
 * A clinic uses ONE connection at a time: the official Cloud API (Meta) or the
 * unofficial WhatsApp Web (Evolution API). Before anything is connected both
 * are offered as tabs; once one is, only its panel shows — switching means
 * disconnecting it first.
 */
export default function WhatsappManager({ clinicId, config, appUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Provider>(config?.provider ?? "META_CLOUD");

  const metaPanel = (
    <div className="space-y-5">
      <ConnectionConfig
        clinicId={clinicId}
        initialConfig={config?.provider === "META_CLOUD" ? config : null}
        appUrl={appUrl}
      />
      {/* <CreateTemplate clinicId={clinicId} disabled={!config} /> */}
      <TemplatesList clinicId={clinicId} disabled={config?.provider !== "META_CLOUD"} />
    </div>
  );
  const evolutionPanel = (
    <EvolutionConnection clinicId={clinicId} configured={config?.provider === "EVOLUTION"} />
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
          {open ? "إخفاء الإعدادات" : config ? "إدارة الاتصال" : "إعداد واتساب لهذه العيادة"}
          <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4 border-t border-border pt-4">
        {config ? (
          config.provider === "EVOLUTION" ? (
            evolutionPanel
          ) : (
            metaPanel
          )
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Provider)} dir="rtl">
            <TabsList className="mb-4">
              <TabsTrigger value="META_CLOUD">الرسمي (Cloud API)</TabsTrigger>
              <TabsTrigger value="EVOLUTION">واتساب ويب (Evolution)</TabsTrigger>
            </TabsList>
            <TabsContent value="META_CLOUD">{metaPanel}</TabsContent>
            <TabsContent value="EVOLUTION">{evolutionPanel}</TabsContent>
          </Tabs>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
