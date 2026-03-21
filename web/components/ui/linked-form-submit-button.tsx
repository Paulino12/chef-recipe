"use client";

import * as React from "react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { cn } from "@/lib/utils";

type LinkedFormSubmitButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "form"
> & {
  children: React.ReactNode;
  formId: string;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  showSpinner?: boolean;
};

export function LinkedFormSubmitButton({
  children,
  formId,
  pendingText,
  disabled,
  variant = "default",
  size = "default",
  className,
  showSpinner = true,
  onClick,
  ...props
}: LinkedFormSubmitButtonProps) {
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={Boolean(disabled || pending)}
      aria-busy={pending || undefined}
      className={cn("min-w-20", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || pending) return;

        const form = document.getElementById(formId);
        if (!(form instanceof HTMLFormElement)) return;

        setPending(true);
        form.requestSubmit();
      }}
      {...props}
    >
      {pending && showSpinner ? <ButtonSpinner /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
