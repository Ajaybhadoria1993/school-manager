"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useToast } from "@/components/ui/toast-context";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn, formatDate } from "@/lib/utils";
import { PromotionTab } from "@/components/settings/PromotionTab";
import type { AcademicYear, ApiResponse, Branch, ClassMaster, Section } from "@/types";

const TABS = ["Academic Years", "Classes & Sections", "Branches", "Year Rollover"] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Academic Years");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">School Setup</h2>
        <p className="text-sm text-foreground-muted">Branches, academic years, and the class/section hierarchy.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Academic Years" && <AcademicYearsTab />}
      {tab === "Classes & Sections" && <ClassesTab />}
      {tab === "Branches" && <BranchesTab />}
      {tab === "Year Rollover" && <PromotionTab />}
    </div>
  );
}

function AcademicYearsTab() {
  const { push } = useToast();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ branchId: "", name: "", startDate: "", endDate: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [yearsRes, branchesRes] = await Promise.all([
      api.get<ApiResponse<AcademicYear[]>>("/academic-years"),
      api.get<ApiResponse<Branch[]>>("/branches"),
    ]);
    setYears(yearsRes.data);
    setBranches(branchesRes.data);
    setForm((f) => ({ ...f, branchId: f.branchId || branchesRes.data[0]?._id || "" }));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/academic-years", {
        branchId: form.branchId,
        name: form.name,
        startDate: form.startDate,
        endDate: form.endDate,
        terms: [],
      });
      push("success", "Academic year created");
      setForm((f) => ({ ...f, name: "", startDate: "", endDate: "" }));
      load();
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to create academic year");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>New Academic Year</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div>
              <Label>Branch</Label>
              <Select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                {branches.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input placeholder="2027-28" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start Date</Label>
                <Input type="date" required value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" required value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <Button type="submit" className="w-full" loading={saving}>
              <Plus className="size-4" />
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Academic Years</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {years.map((y) => (
            <div key={y._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-foreground">{y.name}</p>
                <p className="text-xs text-foreground-muted">
                  {formatDate(y.startDate)} – {formatDate(y.endDate)}
                </p>
              </div>
              {y.isActive && <Badge tone="success">Active</Badge>}
            </div>
          ))}
          {years.length === 0 && <p className="text-sm text-foreground-muted">No academic years yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ClassesTab() {
  const { push } = useToast();
  const { classes, sections } = useAcademicSetup();
  const [className, setClassName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [sectionClassId, setSectionClassId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [localClasses, setLocalClasses] = useState<ClassMaster[]>([]);
  const [localSections, setLocalSections] = useState<Section[]>([]);

  useEffect(() => {
    setLocalClasses(classes);
    setLocalSections(sections);
  }, [classes, sections, refreshTick]);

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/academics/classes", { name: className, order: localClasses.length });
      setClassName("");
      push("success", "Class added");
      const res = await api.get<ApiResponse<ClassMaster[]>>("/academics/classes");
      setLocalClasses(res.data);
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to add class");
    }
  }

  async function addSection(e: React.FormEvent) {
    e.preventDefault();
    if (!sectionClassId) return;
    try {
      await api.post("/academics/sections", { classId: sectionClassId, name: sectionName });
      setSectionName("");
      push("success", "Section added");
      const res = await api.get<ApiResponse<Section[]>>("/academics/sections");
      setLocalSections(res.data);
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to add section");
    }
  }

  async function removeClass(id: string) {
    try {
      await api.delete(`/academics/classes/${id}`);
      setLocalClasses((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to delete class (it may be in use)");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Classes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addClass} className="flex gap-2">
            <Input placeholder="e.g. Class 7" value={className} onChange={(e) => setClassName(e.target.value)} />
            <Button type="submit" size="sm">
              <Plus className="size-4" />
            </Button>
          </form>
          <div className="space-y-1.5">
            {localClasses.map((c) => (
              <div key={c._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm text-foreground">{c.name}</span>
                <button onClick={() => removeClass(c._id)}>
                  <Trash2 className="size-3.5 text-danger" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={addSection} className="flex gap-2">
            <Select value={sectionClassId} onChange={(e) => setSectionClassId(e.target.value)}>
              <option value="">Class</option>
              {localClasses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input placeholder="A" value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
            <Button type="submit" size="sm">
              <Plus className="size-4" />
            </Button>
          </form>
          <div className="space-y-1.5">
            {localSections.map((s) => (
              <div key={s._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="text-foreground-muted">{localClasses.find((c) => c._id === s.classId)?.name}</span>
                <Badge tone="primary">{s.name}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BranchesTab() {
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    api.get<ApiResponse<Branch[]>>("/branches").then((res) => setBranches(res.data));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {branches.map((b) => (
          <div key={b._id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">{b.name}</p>
              <p className="text-xs text-foreground-muted">
                {b.code} &middot; {b.board} {b.udisePlusCode ? `· UDISE+ ${b.udisePlusCode}` : ""}
              </p>
            </div>
            <Badge tone={b.isActive ? "success" : "neutral"}>{b.isActive ? "Active" : "Inactive"}</Badge>
          </div>
        ))}
        {branches.length === 0 && <p className="text-sm text-foreground-muted">No branches yet.</p>}
      </CardContent>
    </Card>
  );
}
