"use client";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast: "rounded-md border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]",
          description: "text-[var(--muted-foreground)]",
        },
      }}
    />
  );
}
