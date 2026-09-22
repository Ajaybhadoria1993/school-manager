"use client";

import { useEffect, useState } from "react";
import { ArrowRight, GraduationCap } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast-context";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { ApiResponse } from "@/types";

interface PreviewRow {
  classId: string;
  className: string;
  activeStudentCount: number;
}

interface PromotionResult {
  promoted: number;
  graduated: number;
  totalProcessed: number;
  skipped: { studentId: string; name: string; reason: string }[];
}

const GRADUATE_VALUE = "__graduate__";

export function PromotionTab() {
  const { push } = useToast();
  const { academicYears, classes } = useAcademicSetup();
  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PromotionResult | null>(null);

  useEffect(() => {
    if (!fromYearId) {
      setPreview([]);
      return;
    }
    api.get<ApiResponse<PreviewRow[]>>("/academics/promote/preview", { academicYearId: fromYearId }).then((res) => {
      setPreview(res.data);
      const next: Record<string, string> = {};
      for (const row of res.data) {
        const currentIdx = classes.findIndex((c) => c._id === row.classId);
        const nextClass = classes[currentIdx + 1];
        next[row.classId] = nextClass ? nextClass._id : GRADUATE_VALUE;
      }
      setMapping(next);
    });
  }, [fromYearId, classes]);

  async function run() {
    if (!fromYearId || !toYearId) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await api.post<ApiResponse<PromotionResult>>("/academics/promote", {
        fromAcademicYearId: fromYearId,
        toAcademicYearId: toYearId,
        classMapping: preview.map((row) => ({
          fromClassId: row.classId,
          toClassId: mapping[row.classId] === GRADUATE_VALUE ? null : mapping[row.classId],
        })),
      });
      setResult(res.data);
      push("success", `Promoted ${res.data.promoted} students, ${res.data.graduated} graduated`);
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to promote students");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic Year Rollover &amp; Student Promotion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-foreground-muted">
          Move all active students from one academic year into the next class of a new academic year. Fee dues left
          over from the old year stay visible in the Outstanding Dues report — nothing is lost.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>From Academic Year</Label>
            <Select value={fromYearId} onChange={(e) => setFromYearId(e.target.value)}>
              <option value="">Select year</option>
              {academicYears.map((y) => (
                <option key={y._id} value={y._id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>To Academic Year</Label>
            <Select value={toYearId} onChange={(e) => setToYearId(e.target.value)}>
              <option value="">Select year</option>
              {academicYears
                .filter((y) => y._id !== fromYearId)
                .map((y) => (
                  <option key={y._id} value={y._id}>
                    {y.name}
                  </option>
                ))}
            </Select>
            <p className="mt-1 text-xs text-foreground-muted">
              Create the new year first under the &quot;Academic Years&quot; tab if it doesn&apos;t exist yet.
            </p>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Class Mapping</p>
            {preview.map((row) => (
              <div key={row.classId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{row.className}</p>
                  <p className="text-xs text-foreground-muted">{row.activeStudentCount} active students</p>
                </div>
                <ArrowRight className="size-4 text-foreground-muted" />
                <Select
                  className="w-48"
                  value={mapping[row.classId] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [row.classId]: e.target.value }))}
                >
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                  <option value={GRADUATE_VALUE}>Graduate (mark Alumni)</option>
                </Select>
              </div>
            ))}

            <Button className="w-full" loading={running} disabled={!toYearId} onClick={run}>
              <GraduationCap className="size-4" />
              Run Promotion
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">{result.promoted} promoted</Badge>
              <Badge tone="primary">{result.graduated} graduated</Badge>
              {result.skipped.length > 0 && <Badge tone="warning">{result.skipped.length} skipped</Badge>}
            </div>
            {result.skipped.length > 0 && (
              <div className="space-y-1 text-sm">
                {result.skipped.map((s) => (
                  <p key={s.studentId} className="text-foreground-muted">
                    <span className="font-medium text-foreground">{s.name}</span>: {s.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
