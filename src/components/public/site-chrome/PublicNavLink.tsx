"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";

type PublicNavLinkProps = {
  active: boolean;
  href: string;
  label: string;
};

export function PublicNavLink({ active, href, label }: PublicNavLinkProps) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`sunny-nav-link max-w-full ${active ? "sunny-nav-link-active" : ""}`}
    >
      <span>{label}</span>
      <PublicNavPendingIndicator />
    </Link>
  );
}

export function PublicNavPendingIndicator() {
  const { pending } = useLinkStatus();

  return <span aria-hidden className={`sunny-link-pending ${pending ? "sunny-link-pending-active" : ""}`} />;
}
