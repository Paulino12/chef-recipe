"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { cn } from "@/lib/utils";

type FormSubmitButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  showSpinner?: boolean;
};

/**
 * Reusable submit control for server actions/forms.
 * Shows pending feedback and prevents double submits while work is in-flight.
 */
export function FormSubmitButton({
  children,
  pendingText,
  disabled,
  variant = "default",
  size = "default",
  className,
  showSpinner = true,
  ...props
}: FormSubmitButtonProps) {
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
      {...props}
    >
      {pending && showSpinner ? <ButtonSpinner /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
