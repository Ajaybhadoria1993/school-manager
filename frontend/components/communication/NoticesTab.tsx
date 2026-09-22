"use client";

import { useEffect, useState } from "react";
import { Plus, Eye, Megaphone } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input, Textarea, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, Notice, NoticeReadReceipts } from "@/types";

const STAFF_ROLES = ["super_admin", "school_admin", "principal", "teacher"];

export function NoticesTab() {
  const { user } = useAuth();
  const { push } = useToast();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiptsFor, setReceiptsFor] = useState<Notice | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const isStaff = !!user && STAFF_ROLES.includes(user.role);

  async function load() {
    const res = await api.get<ApiResponse<Notice[]>>("/communication/notices");
    setNotices(res.data);
  }

  useEffect(() => {
    load();
  }, []);

  async function openNotice(notice: Notice) {
    if (!isStaff && !readIds.has(notice._id)) {
      await api.post(`/communication/notices/${notice._id}/read`, {});
      setReadIds((prev) => new Set(prev).add(notice._id));
    }
  }

  return (
    <div className="space-y-4">
      {isStaff && (
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Publish Notice
          </Button>
        </div>
      )}

      {notices.length === 0 ? (
        <Card>
          <EmptyState title="No notices yet" description="Published circulars and announcements will appear here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((notice) => (
            <Card key={notice._id} className="p-4" onClick={() => openNotice(notice)}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Megaphone className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{notice.title}</p>
                    <p className="mt-1 text-sm text-foreground-muted">{notice.body}</p>
                    <p className="mt-2 text-xs text-foreground-muted">
                      {formatDate(notice.publishedAt)} &middot; Audience: {notice.audienceType}
                    </p>
                  </div>
                </div>
                {isStaff && (
                  <Button size="sm" variant="ghost" onClick={() => setReceiptsFor(notice)}>
                    <Eye className="size-3.5" />
                    Reads
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Publish Notice">
        <CreateNoticeForm
          onSave={async (data) => {
            try {
              await api.post("/communication/notices", data);
              push("success", "Notice published — guardians notified");
              setCreateOpen(false);
              load();
            } catch (err) {
              push("error", err instanceof ApiRequestError ? err.message : "Failed to publish notice");
            }
          }}
        />
      </Modal>

      <Modal open={!!receiptsFor} onClose={() => setReceiptsFor(null)} title="Read Receipts">
        {receiptsFor && <ReadReceipts noticeId={receiptsFor._id} />}
      </Modal>
    </div>
  );
}

function CreateNoticeForm({
  onSave,
}: {
  onSave: (data: { title: string; body: string; audienceType: string; classId?: string; sectionId?: string }) => void;
}) {
  const { user } = useAuth();
  const { classes, sectionsForClass } = useAcademicSetup();
  const isTeacher = user?.role === "teacher";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState(isTeacher ? "section" : "all");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  return (
    <div className="space-y-4">
      <FormField label="Title">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
      </FormField>
      <FormField label="Message">
        <Textarea required rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </FormField>
      <FormField label="Audience">
        <Select value={audienceType} onChange={(e) => setAudienceType(e.target.value)} disabled={isTeacher}>
          <option value="all">Entire School</option>
          <option value="class">A Class</option>
          <option value="section">A Section</option>
        </Select>
      </FormField>
      {(audienceType === "class" || audienceType === "section") && (
        <FormField label="Class">
          <Select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSectionId("");
            }}
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      {audienceType === "section" && (
        <FormField label="Section">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
            <option value="">Select section</option>
            {sectionsForClass(classId).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <Button
        className="w-full"
        disabled={!title || !body || (audienceType === "class" && !classId) || (audienceType === "section" && !sectionId)}
        onClick={() => onSave({ title, body, audienceType, classId: classId || undefined, sectionId: sectionId || undefined })}
      >
        Publish
      </Button>
    </div>
  );
}

function ReadReceipts({ noticeId }: { noticeId: string }) {
  const [receipts, setReceipts] = useState<NoticeReadReceipts | null>(null);

  useEffect(() => {
    api.get<ApiResponse<NoticeReadReceipts>>(`/communication/notices/${noticeId}/read-receipts`).then((res) => setReceipts(res.data));
  }, [noticeId]);

  if (!receipts) return <p className="text-sm text-foreground-muted">Loading…</p>;

  return (
    <div className="space-y-3">
      <Badge tone="primary">
        {receipts.totalRead} / {receipts.totalEligible} guardians have read this
      </Badge>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {receipts.readers.map((r, idx) => (
          <div key={idx} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-foreground">{r.name}</span>
            <span className="text-xs text-foreground-muted">{formatDate(r.readAt)}</span>
          </div>
        ))}
        {receipts.readers.length === 0 && <p className="text-sm text-foreground-muted">No one has read this yet.</p>}
      </div>
    </div>
  );
}
