"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConfirmSubmitButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: React.ReactNode;
  confirmMessage: string;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  showSpinner?: boolean;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
}

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  pendingText,
  disabled,
  variant = "default",
  size = "default",
  className,
  showSpinner = true,
  onClick,
  ...props
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled || pending);

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={isDisabled}
      aria-busy={pending || undefined}
      className={cn("min-w-20", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || pending) return;
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      {...props}
    >
      {pending && showSpinner ? <Spinner /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
