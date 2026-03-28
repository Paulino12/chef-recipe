"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type ClearableInputProps = React.ComponentProps<"input"> & {
  containerClassName?: string;
  clearLabel?: string;
};

function setInputValue(input: HTMLInputElement, nextValue: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );

  descriptor?.set?.call(input, nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const ClearableInput = React.forwardRef<HTMLInputElement, ClearableInputProps>(
  (
    {
      className,
      containerClassName,
      clearLabel = "Clear search",
      onChange,
      type = "text",
      value,
      defaultValue,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const [hasValue, setHasValue] = React.useState<boolean>(() =>
      String(value ?? defaultValue ?? "").trim().length > 0,
    );

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

    React.useEffect(() => {
      if (value !== undefined) {
        setHasValue(String(value ?? "").trim().length > 0);
      }
    }, [value]);

    return (
      <div className={cn("relative", containerClassName)}>
        <Input
          {...props}
          ref={inputRef}
          type={type}
          value={value}
          defaultValue={defaultValue}
          onChange={(event) => {
            setHasValue(event.target.value.trim().length > 0);
            onChange?.(event);
          }}
          className={cn("pr-10", className)}
        />
        {hasValue ? (
          <button
            type="button"
            aria-label={clearLabel}
            onClick={() => {
              const input = inputRef.current;
              if (!input) return;

              setInputValue(input, "");
              setHasValue(false);
              input.focus();
            }}
            className="absolute inset-y-0 right-2 my-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        ) : null}
      </div>
    );
  },
);
ClearableInput.displayName = "ClearableInput";

export { ClearableInput };
