"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Homework, Subject } from "@/types";

export default function StudentHomeworkPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResponse<Homework[]>>(`/homework/student/${params.studentId}`)
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }, [params.studentId]);

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-foreground">Homework</h2>
        <p className="text-sm text-foreground-muted">Latest assignments, most recent first.</p>
      </div>

      {loading ? (
        <p className="text-sm text-foreground-muted">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="No homework yet" description="New assignments will appear here as soon as they're published." />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((hw) => (
            <Card key={hw._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <BookOpen className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{hw.title}</p>
                    <p className="text-xs text-foreground-muted">{(hw.subjectId as Subject)?.name}</p>
                  </div>
                </div>
                <span className="whitespace-nowrap text-xs text-foreground-muted">Due {formatDate(hw.dueDate)}</span>
              </div>
              <p className="mt-3 text-sm text-foreground-muted">{hw.description}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
