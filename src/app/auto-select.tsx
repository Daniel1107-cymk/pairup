"use client";

import type { ComponentProps } from "react";

/** A <select> that submits its parent form on change — no save button needed. */
export function AutoSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
