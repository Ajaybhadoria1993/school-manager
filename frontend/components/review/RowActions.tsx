"use client";

import { useState } from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";
import { Button, Link, Tooltip } from "@heroui/react";

/** A small button that copies `text`. The icon turns into a tick for a moment (a screen reader is told "Copied"). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // no clipboard access (an insecure page, say): leave the button as it was
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <Tooltip delay={250}>
        <Button isIconOnly size="sm" variant="ghost" aria-label={`Copy ${label}`} onPress={copy}>
          {copied ? <Check className="pop-in size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </Button>
        <Tooltip.Content>{`Copy ${label}`}</Tooltip.Content>
      </Tooltip>
      <span role="status" className="sr-only">
        {copied ? "Copied to the clipboard" : ""}
      </span>
    </>
  );
}

/** An icon link: call a number, write to an address, open a page or a map. */
export function ActionLink({ href, label, icon: Icon, external }: { href: string; label: string; icon: LucideIcon; external?: boolean }) {
  return (
    <Tooltip delay={250}>
      <Link
        href={href}
        aria-label={label}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="inline-flex size-8 items-center justify-center rounded-lg text-foreground-muted no-underline transition-colors hover:bg-primary-soft hover:text-primary"
      >
        <Icon className="size-4" aria-hidden />
      </Link>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}
