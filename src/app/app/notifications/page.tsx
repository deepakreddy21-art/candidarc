"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/services/api";
import type { Notification } from "@/types/domain";
import { formatRelative } from "@/lib/utils";

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);

  useEffect(() => {
    void api.listNotifications().then(setItems);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="New jobs, resume work, and application reminders." />
      {!items ? <Skeleton className="h-40 w-full" /> : null}
      {items && items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Create a job alert from Jobs to receive matches here. Email delivery stays off until a provider is configured."
        />
      ) : null}
      {items && items.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href || "/app/radar"}
                className="block px-4 py-3 hover:bg-surface-2"
                onClick={() => {
                  if (!item.read) void api.markNotificationRead(item.id);
                }}
              >
                <p className="text-sm font-medium text-foreground">
                  {item.read ? item.title : `${item.title} · New`}
                </p>
                <p className="mt-1 text-sm text-foreground-secondary">{item.body}</p>
                <p className="mt-1 text-xs text-foreground-muted">{formatRelative(item.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
