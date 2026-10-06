"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ar as arDateFns } from "date-fns/locale";
import { ar } from "react-day-picker/locale";
import { CalendarIcon, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/**
 * One labelled form control whose widget is chosen by `type`:
 *
 *   <FormField type="text" label="الاسم" value={name} onValueChange={setName} />
 *   <FormField type="select" label="النوع" options={kinds} name="kind" defaultValue="CHECKUP" />
 *   <FormField type="date" label="تاريخ الزيارة" value={date} onValueChange={setDate} />
 *   <FormField type="checkbox" label="مفعل" checked={on} onCheckedChange={setOn} />
 *   <FormField type="password" name="password" startIcon={<Lock />} size="lg" />
 *   <FormField type="otp" length={6} name="token" value={code} onValueChange={setCode} />
 *
 * Works controlled (`value` + `onValueChange`) or uncontrolled inside a `<form>`
 * (`name` + `defaultValue`) — every widget submits its value under `name`.
 */

type FieldChrome = {
  label?: React.ReactNode;
  /** Small muted text under the control. */
  hint?: React.ReactNode;
  /** Red text under the control; also marks it aria-invalid. */
  error?: string | null;
  /** Classes for the wrapper (label + control + messages). */
  className?: string;
  /** Classes for the control itself. */
  controlClassName?: string;
  labelClassName?: string;
  /** Rendered at the end of the label row, e.g. a "forgot password?" link. */
  labelAction?: React.ReactNode;
  /** "lg" is the taller, rounder control used on auth and public pages. */
  size?: "default" | "lg";
};

const SIZE_CLASSES = {
  default: "",
  lg: "h-12 rounded-2xl bg-white px-4 focus:border-accent focus:ring-accent/40 focus-visible:border-accent focus-visible:ring-accent/40",
} as const;

type NativeInputProps = Omit<React.ComponentProps<"input">, "type" | "className" | "size">;

type TextFieldProps = FieldChrome &
  NativeInputProps & {
    type?: "text" | "email" | "password" | "tel" | "number" | "url" | "search" | "time" | "file";
    onValueChange?: (value: string) => void;
    /** Icon shown inside the input at the start edge. */
    startIcon?: React.ReactNode;
  };

type TextareaFieldProps = FieldChrome &
  Omit<React.ComponentProps<"textarea">, "className"> & {
    type: "textarea";
    onValueChange?: (value: string) => void;
  };

export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean };

type SelectFieldProps = FieldChrome & {
  type: "select";
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  dir?: "rtl" | "ltr";
};

type DateFieldProps = FieldChrome & {
  type: "date";
  /** "YYYY-MM-DD", same format as a native date input. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** "YYYY-MM-DD" bounds, inclusive. */
  min?: string;
  max?: string;
};

type OtpFieldProps = FieldChrome & {
  type: "otp";
  /** Number of digit boxes. */
  length: number;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Fired once every box is filled. */
  onComplete?: (value: string) => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
};

type CheckFieldProps = FieldChrome & {
  type: "checkbox" | "switch";
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  name?: string;
  /** Submitted value when checked (default "on", like a native checkbox). */
  value?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
};

export type FormFieldProps =
  | TextFieldProps
  | TextareaFieldProps
  | SelectFieldProps
  | DateFieldProps
  | OtpFieldProps
  | CheckFieldProps;

/** Types whose content is Latin/numeric and reads better left-to-right. */
const LTR_TYPES = new Set(["email", "tel", "number", "url", "time"]);

export function FormField(props: FormFieldProps) {
  const autoId = React.useId();
  const id = props.id ?? autoId;
  const { label, hint, error, className, labelClassName, labelAction } = props;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const isInline = props.type === "checkbox" || props.type === "switch";
  const control = renderControl(props, id, describedBy);

  const labelNode = label ? (
    <Label
      htmlFor={id}
      className={cn("font-sans text-sm font-medium text-foreground", labelClassName)}
    >
      {label}
    </Label>
  ) : null;

  return (
    <div className={cn("relative", isInline ? "space-y-1" : "space-y-1.5", className)}>
      {isInline ? (
        <div className="flex items-center gap-2">
          {control}
          {labelNode}
        </div>
      ) : (
        <>
          {labelAction ? (
            <div className="flex items-center justify-between gap-2">
              {labelNode}
              {labelAction}
            </div>
          ) : (
            labelNode
          )}
          {control}
        </>
      )}
      {error ? (
        <p id={`${id}-error`} className="font-sans text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="font-sans text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function renderControl(props: FormFieldProps, id: string, describedBy: string | undefined) {
  const invalid = props.error ? true : undefined;

  switch (props.type) {
    case "textarea": {
      const {
        type: _t,
        label: _l,
        hint: _h,
        error: _e,
        className: _c,
        labelClassName: _lc,
        labelAction: _la,
        size = "default",
        controlClassName,
        onValueChange,
        onChange,
        ...rest
      } = props;
      return (
        <Textarea
          {...rest}
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(size === "lg" && "rounded-2xl px-4", controlClassName)}
          onChange={(e) => {
            onChange?.(e);
            onValueChange?.(e.target.value);
          }}
        />
      );
    }

    case "select":
      return <SelectControl {...props} id={id} invalid={invalid} describedBy={describedBy} />;

    case "date":
      return <DateControl {...props} id={id} invalid={invalid} describedBy={describedBy} />;

    case "otp":
      return (
        // Digits always read left-to-right, even on an RTL page.
        <div dir="ltr" className="flex justify-center">
          <InputOTP
            id={id}
            name={props.name}
            maxLength={props.length}
            pattern="^[0-9]*$"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={props.value}
            onChange={(v) => props.onValueChange?.(v)}
            onComplete={props.onComplete}
            required={props.required}
            disabled={props.disabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            containerClassName={props.controlClassName}
          >
            <InputOTPGroup>
              {Array.from({ length: props.length }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      );

    case "checkbox":
    case "switch": {
      const Control = props.type === "checkbox" ? Checkbox : Switch;
      return (
        <Control
          id={id}
          name={props.name}
          value={props.value}
          checked={props.checked}
          defaultChecked={props.defaultChecked}
          onCheckedChange={(c) => props.onCheckedChange?.(c === true)}
          required={props.required}
          disabled={props.disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={props.controlClassName}
        />
      );
    }

    default:
      return <TextControl {...props} id={id} invalid={invalid} describedBy={describedBy} />;
  }
}

function TextControl({
  type = "text",
  label: _l,
  hint: _h,
  error: _e,
  className: _c,
  labelClassName: _lc,
  labelAction: _la,
  size = "default",
  controlClassName,
  onValueChange,
  onChange,
  dir,
  startIcon,
  invalid,
  describedBy,
  ...rest
}: TextFieldProps & { id: string; invalid?: boolean; describedBy?: string }) {
  const [revealed, setRevealed] = React.useState(false);
  const isPassword = type === "password";
  const effectiveDir = dir ?? (LTR_TYPES.has(type) || isPassword ? "ltr" : undefined);

  const input = (
    <Input
      {...rest}
      type={isPassword && revealed ? "text" : type}
      dir={effectiveDir}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={cn(
        SIZE_CLASSES[size],
        // Icons sit on the logical start/end of the *page* (RTL), so pad by side
        // rather than by the input's own direction.
        startIcon && "pr-11",
        isPassword && "pl-11",
        effectiveDir === "ltr" && startIcon && "text-right placeholder:text-right",
        controlClassName
      )}
      onChange={(e) => {
        onChange?.(e);
        onValueChange?.(e.target.value);
      }}
    />
  );

  if (!startIcon && !isPassword) return input;

  return (
    <div className="relative">
      {startIcon && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground/70 [&_svg]:size-[18px]">
          {startIcon}
        </span>
      )}
      {input}
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="absolute inset-y-0 left-0 flex items-center pl-4 text-muted-foreground/70 transition-colors hover:text-primary [&_svg]:size-[18px]"
        >
          {revealed ? <EyeOff /> : <Eye />}
        </button>
      )}
    </div>
  );
}

/** Radix Select forbids "" as an item value; map it through a sentinel so "none" options still work. */
const EMPTY = "__empty__";
const toRadix = (v: string | undefined) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

function SelectControl({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  id,
  required,
  disabled,
  dir,
  size = "default",
  controlClassName,
  invalid,
  describedBy,
}: SelectFieldProps & { id: string; invalid?: boolean; describedBy?: string }) {
  // Track the value ourselves so the hidden input submits "" (not the sentinel) under `name`.
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  // An "" option with no explicit placeholder doubles as the placeholder text.
  const emptyOption = options.find((o) => o.value === "");

  return (
    <>
      <Select
        value={current === "" && !emptyOption ? undefined : toRadix(current)}
        onValueChange={(v) => {
          const next = fromRadix(v);
          setInner(next);
          onValueChange?.(next);
        }}
        disabled={disabled}
        dir={dir}
      >
        <SelectTrigger
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(SIZE_CLASSES[size], controlClassName)}
        >
          <SelectValue placeholder={placeholder ?? emptyOption?.label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={toRadix(o.value)!} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name && (
        // Visually hidden but focusable-by-validation, so `required` blocks submit like a native select.
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          value={current}
          required={required}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}
    </>
  );
}

const ISO = "yyyy-MM-dd";
const parseIso = (v: string | undefined) => {
  if (!v) return undefined;
  const d = parse(v, ISO, new Date());
  return isValid(d) ? d : undefined;
};

function DateControl({
  value,
  defaultValue,
  onValueChange,
  placeholder = "اختر التاريخ",
  name,
  id,
  required,
  disabled,
  min,
  max,
  size = "default",
  controlClassName,
  invalid,
  describedBy,
}: DateFieldProps & { id: string; invalid?: boolean; describedBy?: string }) {
  const [open, setOpen] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const selected = parseIso(current);
  const minDate = parseIso(min);
  const maxDate = parseIso(max);

  const disabledDays = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          data-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-start font-sans text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-red-400",
            !selected && "text-muted-foreground",
            SIZE_CLASSES[size],
            controlClassName
          )}
        >
          <span className="truncate">
            {selected ? format(selected, "d MMMM yyyy", { locale: arDateFns }) : placeholder}
          </span>
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ar}
          dir="rtl"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? minDate}
          startMonth={minDate ?? new Date(1920, 0)}
          endMonth={maxDate ?? new Date(new Date().getFullYear() + 10, 11)}
          disabled={disabledDays}
          onSelect={(d) => {
            const next = d ? format(d, ISO) : "";
            setInner(next);
            onValueChange?.(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
      {name && (
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          value={current}
          required={required}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      )}
    </Popover>
  );
}
