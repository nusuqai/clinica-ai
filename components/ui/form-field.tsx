"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { ar as arDateFns } from "date-fns/locale";
import { ar } from "react-day-picker/locale";
import { CalendarIcon, Eye, EyeOff } from "lucide-react";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";

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
 *
 * Or hand it react-hook-form's `control`: value, change/blur, focus-on-error and
 * the error message then all come from the form, and typing re-renders only this
 * field rather than the whole form:
 *
 *   const form = useForm({ resolver: zodResolver(schema), defaultValues });
 *   <FormField control={form.control} name="email" type="email" label="البريد" />
 */

type FieldChrome = {
  label?: React.ReactNode;
  /** Small muted text under the control. */
  hint?: React.ReactNode;
  /** Red text under the control; also marks it aria-invalid. */
  error?: string | null;
  /** Classes for the error text, e.g. a lighter red on a dark section. */
  errorClassName?: string;
  /** Classes for the wrapper (label + control + messages). */
  className?: string;
  /** Classes for the control itself. */
  controlClassName?: string;
  labelClassName?: string;
  /** Rendered at the end of the label row, e.g. a "forgot password?" link. */
  labelAction?: React.ReactNode;
  /** "lg" is the taller, rounder control used on auth and public pages. */
  size?: "default" | "lg";
  /** Set only through the react-hook-form overload below. */
  control?: undefined;
};

/** Internal: lets react-hook-form focus non-input widgets (select, date, otp, checkbox) on error. */
type ControlRef = { controlRef?: React.Ref<HTMLElement> };

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
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  dir?: "rtl" | "ltr";
} & ControlRef;

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
} & ControlRef;

type OtpFieldProps = FieldChrome & {
  type: "otp";
  /** Number of digit boxes. */
  length: number;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Fired once every box is filled. */
  onComplete?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
} & ControlRef;

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
} & ControlRef;

export type FormFieldProps =
  | TextFieldProps
  | TextareaFieldProps
  | SelectFieldProps
  | DateFieldProps
  | OtpFieldProps
  | CheckFieldProps;

/** `Omit` that keeps a union a union (plain `Omit` would flatten it). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The react-hook-form flavour: `control` + a typed `name` replace value/checked/onChange. */
export type ConnectedFormFieldProps<T extends FieldValues> = DistributiveOmit<
  FormFieldProps,
  "control" | "name" | "value" | "defaultValue" | "checked" | "defaultChecked" | "ref"
> & {
  // `any` for the context/transformed-value slots: a zod schema whose input and
  // output types differ yields Control<Input, any, Output>.
  control: Control<T, any, any>;
  name: FieldPath<T>;
};

/** Types whose content is Latin/numeric and reads better left-to-right. */
const LTR_TYPES = new Set(["email", "tel", "number", "url", "time"]);

export function FormField<T extends FieldValues>(
  props: ConnectedFormFieldProps<T>
): React.JSX.Element;
export function FormField(props: FormFieldProps): React.JSX.Element;
export function FormField<T extends FieldValues>(
  props: FormFieldProps | ConnectedFormFieldProps<T>
) {
  if (props.control) return <ConnectedField {...(props as ConnectedFormFieldProps<T>)} />;
  return <FieldView {...(props as FormFieldProps)} />;
}

/**
 * Binds one field to react-hook-form via useController, so only this component
 * subscribes to (and re-renders for) its own value and error.
 */
function ConnectedField<T extends FieldValues>({
  control,
  name,
  ...props
}: ConnectedFormFieldProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const error = props.error ?? fieldState.error?.message;

  // The caller's own handlers still fire after the form's. Loosely typed here
  // because they differ per widget; each case below passes the matching shape.
  const own = props as {
    onValueChange?: (v: string) => void;
    onCheckedChange?: (c: boolean) => void;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (e?: React.FocusEvent<HTMLElement>) => void;
  };

  let bound: Record<string, unknown>;
  switch (props.type) {
    case "checkbox":
    case "switch":
      bound = {
        controlRef: field.ref,
        checked: !!field.value,
        onCheckedChange: (checked: boolean) => {
          field.onChange(checked);
          own.onCheckedChange?.(checked);
        },
      };
      break;

    case "select":
    case "date":
    case "otp":
      // No blur for select/date: focus moves into their popup, which would mark
      // them touched (and flash "required") the moment they open.
      bound = {
        controlRef: field.ref,
        value: field.value ?? "",
        onValueChange: (value: string) => {
          field.onChange(value);
          own.onValueChange?.(value);
        },
        ...(props.type === "otp" && {
          onBlur: () => {
            field.onBlur();
            own.onBlur?.();
          },
        }),
      };
      break;

    case "file":
      // A file input can't be given a value; hand the form the picked FileList instead.
      bound = {
        ref: field.ref,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          field.onChange(e.target.files);
          own.onChange?.(e);
        },
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          field.onBlur();
          own.onBlur?.(e);
        },
      };
      break;

    default:
      bound = {
        ref: field.ref,
        value: field.value ?? "",
        onValueChange: (value: string) => {
          field.onChange(value);
          own.onValueChange?.(value);
        },
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          field.onBlur();
          own.onBlur?.(e);
        },
      };
  }

  return <FieldView {...({ ...props, ...bound, name: field.name, error } as FormFieldProps)} />;
}

function FieldView(props: FormFieldProps) {
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
        <p
          id={`${id}-error`}
          className={cn("font-sans text-xs text-red-600", props.errorClassName)}
        >
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
        errorClassName: _ec,
        className: _c,
        labelClassName: _lc,
        labelAction: _la,
        control: _ctl,
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
            onBlur={props.onBlur}
            ref={props.controlRef as React.Ref<HTMLInputElement>}
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
          ref={props.controlRef as React.Ref<HTMLButtonElement>}
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
  errorClassName: _ec,
  className: _c,
  labelClassName: _lc,
  labelAction: _la,
  control: _ctl,
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
  controlRef,
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
          ref={controlRef as React.Ref<HTMLButtonElement>}
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
      {(name || required) && (
        // Visually hidden but focusable-by-validation, so `required` blocks submit like a
        // native select. Rendered for `required` alone too, when the caller submits elsewhere.
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
  controlRef,
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
          ref={controlRef as React.Ref<HTMLButtonElement>}
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
      {(name || required) && (
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
