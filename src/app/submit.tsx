"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

/** A <button> that disables itself and blurs its label while the parent form's server action runs. */
export function Submit({ children, disabled, ...rest }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} disabled={disabled || pending} data-pending={pending || undefined}>
      <span className="inline-block">{children}</span>
    </button>
  );
}
