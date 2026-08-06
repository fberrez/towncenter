import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

// The art direction is the `.button` block in globals.css; variants point at it.
const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary: "button--primary",
      secondary: "button--secondary",
      quiet: "button--quiet",
    },
    size: {
      default: "",
      compact: "button--compact",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "default",
  },
});

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    fullWidth?: boolean;
  };

function Button({
  className,
  variant,
  size,
  fullWidth = false,
  asChild = false,
  // Without an explicit `type`, a button in a form defaults to `submit`.
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? undefined : type}
      className={cn(
        buttonVariants({ variant, size }),
        fullWidth && "button--full",
        className,
      )}
      {...props}
    />
  );
}

export { Button, buttonVariants };
