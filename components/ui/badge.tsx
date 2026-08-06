import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// The badge here is the system's gutter label: wide-tracked capitals, no chip.
const badgeVariants = cva("", {
  variants: {
    variant: {
      secondary: "tone-2",
      primary: "tone-1",
      accent: "tone-accent",
    },
    size: {
      label: "t-label",
      micro: "t-micro",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "label",
  },
});

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

function Badge({ className, variant, size, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
