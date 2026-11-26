"use client";

import { useRef, useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { clinicLogoUploadAction } from "@/server/actions/clinics";
import { createClient } from "@/lib/supabase/client";
import { ClinicLogo } from "@/components/general/clinic-logo";
import { Button } from "@/components/ui/button";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Clinic logo picker for the platform console: uploads the chosen image straight
 * to Storage (public clinic-assets bucket) and hands back its public URL, which
 * the surrounding form saves as `logoUrl`. The logo is also the clinic site's
 * favicon and link-preview image.
 */
export function LogoUploadField({
  value,
  onChange,
  clinicId,
  name,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  /** The clinic being edited; omitted while creating a new one. */
  clinicId?: string;
  /** Used for the preview's alt text. */
  name: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("حجم الشعار كبير، الحد الأقصى 2 ميجابايت.");
      return;
    }
    // Some browsers report .ico files with an empty type.
    const mimeType = file.type || (file.name.toLowerCase().endsWith(".ico") ? "image/x-icon" : "");
    setUploading(true);
    try {
      const res = await clinicLogoUploadAction({ clinicId, mimeType, size: file.size });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (!("data" in res) || !res.data) return;
      const up = res.data;
      const { error: upErr } = await createClient()
        .storage.from(up.bucket)
        .uploadToSignedUrl(up.path, up.token, file, { contentType: mimeType });
      if (upErr) {
        setError("تعذّر رفع الشعار، حاول مرة أخرى.");
        return;
      }
      onChange(up.publicUrl);
    } catch {
      setError("تعذّر رفع الشعار، حاول مرة أخرى.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">شعار العيادة</span>
      <div className="flex items-center gap-3">
        <ClinicLogo src={value || null} name={name || "شعار"} className="h-12 w-12" />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={uploading}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <ImageUp className="h-4 w-4" />
          {value ? "تغيير الشعار" : "رفع الشعار"}
        </Button>
        {value && !uploading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange("")}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            إزالة
          </Button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        PNG أو JPG أو WEBP أو SVG، حتى 2 ميجابايت. يظهر كأيقونة الموقع وفي معاينة الروابط.
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
