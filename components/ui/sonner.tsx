"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// This project has its own theme system (`data-theme` on <html>, toggled by
// `useTheme` in `./Toggles`) rather than `next-themes`: reading from that one
// instead is what keeps a toast's colours in sync with the theme actually on
// screen.
import { useTheme } from "./Toggles"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // The app has exactly two feedback colours (see globals.css: "No
          // warning colour. Two states only: success, failure."). `info` and
          // `warning` keep the neutral toast so only success/error stand out.
          "--success-bg": "color-mix(in oklch, var(--success) 12%, var(--popover))",
          "--success-border": "var(--success)",
          "--success-text": "var(--success-text)",
          "--error-bg": "color-mix(in oklch, var(--failure) 12%, var(--popover))",
          "--error-border": "var(--failure)",
          "--error-text": "var(--failure-text)",
          "--info-bg": "var(--popover)",
          "--info-border": "var(--border)",
          "--info-text": "var(--popover-foreground)",
          "--warning-bg": "var(--popover)",
          "--warning-border": "var(--border)",
          "--warning-text": "var(--popover-foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
