"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { useToast } from "@/components/ui/toast-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import type { ApiResponse, FeeHead, FeeStructure } from "@/types";

interface InstallmentDraft {
  name: string;
  dueDate: string;
  items: { feeHeadId: string; amount: string }[];
}

export default function FeeStructuresPage() {
  const { push } = useToast();
  const { classes, activeAcademicYear } = useAcademicSetup();

  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
  const [newHeadName, setNewHeadName] = useState("");
  const [addingHead, setAddingHead] = useState(false);

  const [classId, setClassId] = useState("");
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [installments, setInstallments] = useState<InstallmentDraft[]>([
    { name: "Term 1", dueDate: "", items: [] },
  ]);
  const [saving, setSaving] = useState(false);

  async function loadHeads() {
    const res = await api.get<ApiResponse<FeeHead[]>>("/fees/heads");
    setFeeHeads(res.data);
  }

  async function loadStructures() {
    if (!activeAcademicYear) return;
    const res = await api.get<ApiResponse<FeeStructure[]>>("/fees/structures", {
      academicYearId: activeAcademicYear._id,
    });
    setStructures(res.data);
  }

  useEffect(() => {
    loadHeads();
  }, []);

  useEffect(() => {
    loadStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAcademicYear]);

  async function addFeeHead(e: React.FormEvent) {
    e.preventDefault();
    if (!newHeadName.trim()) return;
    setAddingHead(true);
    try {
      await api.post("/fees/heads", { name: newHeadName.trim() });
      setNewHeadName("");
      await loadHeads();
      push("success", "Fee head added");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to add fee head");
    } finally {
      setAddingHead(false);
    }
  }

  function addInstallment() {
    setInstallments((prev) => [...prev, { name: `Term ${prev.length + 1}`, dueDate: "", items: [] }]);
  }

  function removeInstallment(idx: number) {
    setInstallments((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateInstallment(idx: number, patch: Partial<InstallmentDraft>) {
    setInstallments((prev) => prev.map((inst, i) => (i === idx ? { ...inst, ...patch } : inst)));
  }

  function addItem(idx: number) {
    updateInstallment(idx, {
      items: [...installments[idx].items, { feeHeadId: feeHeads[0]?._id ?? "", amount: "" }],
    });
  }

  function updateItem(idx: number, itemIdx: number, patch: Partial<{ feeHeadId: string; amount: string }>) {
    const items = installments[idx].items.map((it, i) => (i === itemIdx ? { ...it, ...patch } : it));
    updateInstallment(idx, { items });
  }

  function removeItem(idx: number, itemIdx: number) {
    updateInstallment(idx, { items: installments[idx].items.filter((_, i) => i !== itemIdx) });
  }

  async function saveStructure() {
    if (!classId || !activeAcademicYear) {
      push("error", "Select a class first");
      return;
    }
    setSaving(true);
    try {
      await api.post("/fees/structures", {
        branchId: activeAcademicYear.branchId,
        classId,
        academicYearId: activeAcademicYear._id,
        name: "Standard Fee Structure",
        installments: installments.map((inst) => ({
          name: inst.name,
          dueDate: inst.dueDate,
          items: inst.items.map((it) => ({ feeHeadId: it.feeHeadId, amount: Number(it.amount) })),
        })),
      });
      push("success", "Fee structure saved");
      loadStructures();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to save fee structure");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Fee Structure Setup</h2>
        <p className="text-sm text-foreground-muted">Define fee heads and class-wise installment schedules.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Fee Heads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={addFeeHead} className="flex gap-2">
              <Input
                placeholder="e.g. Transport Fee"
                value={newHeadName}
                onChange={(e) => setNewHeadName(e.target.value)}
              />
              <Button type="submit" size="sm" loading={addingHead}>
                <Plus className="size-4" />
              </Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {feeHeads.map((h) => (
                <Badge key={h._id} tone="primary">
                  {h.name}
                </Badge>
              ))}
              {feeHeads.length === 0 && <p className="text-sm text-foreground-muted">No fee heads yet.</p>}
            </div>

            {structures.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  Existing Structures ({activeAcademicYear?.name})
                </p>
                <div className="space-y-1.5">
                  {structures.map((s) => (
                    <div key={s._id} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">
                        {typeof s.classId === "object" ? s.classId.name : "Class"}
                      </span>
                      <span className="ml-2 text-xs text-foreground-muted">
                        {s.installments.length} installment(s)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Build / Update Structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Class</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-4">
              {installments.map((inst, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="max-w-[160px]"
                      value={inst.name}
                      onChange={(e) => updateInstallment(idx, { name: e.target.value })}
                    />
                    <Input
                      type="date"
                      value={inst.dueDate}
                      onChange={(e) => updateInstallment(idx, { dueDate: e.target.value })}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeInstallment(idx)}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {inst.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="flex items-center gap-2">
                        <Select
                          value={item.feeHeadId}
                          onChange={(e) => updateItem(idx, itemIdx, { feeHeadId: e.target.value })}
                        >
                          {feeHeads.map((h) => (
                            <option key={h._id} value={h._id}>
                              {h.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          placeholder="Amount"
                          className="max-w-[140px]"
                          value={item.amount}
                          onChange={(e) => updateItem(idx, itemIdx, { amount: e.target.value })}
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx, itemIdx)}>
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addItem(idx)} disabled={feeHeads.length === 0}>
                      <Plus className="size-3.5" />
                      Add fee head
                    </Button>
                  </div>

                  {inst.items.length > 0 && (
                    <p className="mt-2 text-xs text-foreground-muted">
                      Installment total:{" "}
                      {formatCurrency(inst.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0))}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <Button type="button" variant="outline" size="sm" onClick={addInstallment}>
                <Plus className="size-4" />
                Add installment
              </Button>
              <Button type="button" onClick={saveStructure} loading={saving}>
                <Save className="size-4" />
                Save Structure
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
