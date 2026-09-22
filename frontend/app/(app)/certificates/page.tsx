"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, FileBadge, IdCard as IdCardIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { cn, formatDate, initials } from "@/lib/utils";
import { IssueCertificateModal } from "@/components/certificates/IssueCertificateModal";
import type { ApiResponse, Certificate, CertificateType, ClassMaster, Section, Staff, Student } from "@/types";

const TABS = ["Certificates", "ID Cards"] as const;

export default function CertificatesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Certificates");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Certificates &amp; ID Cards</h2>
        <p className="text-sm text-foreground-muted">Transfer, Bonafide, Fee-Paid certificates and QR ID cards.</p>
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

      {tab === "Certificates" ? <CertificatesTab /> : <IdCardsTab />}
    </div>
  );
}

function CertificatesTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [modalType, setModalType] = useState<CertificateType | null>(null);

  useEffect(() => {
    if (!q) return setResults([]);
    const t = setTimeout(() => {
      api.get<ApiResponse<Student[]>>("/students", { q, limit: 8 }).then((res) => setResults(res.data));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function loadCertificates(studentId: string) {
    const res = await api.get<ApiResponse<Certificate[]>>("/certificates", { studentId });
    setCertificates(res.data);
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          className="pl-9"
          placeholder="Search student by name or admission number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {results.length > 0 && !selected && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
            {results.map((s) => (
              <button
                key={s._id}
                onClick={() => {
                  setSelected(s);
                  setQ("");
                  setResults([]);
                  loadCertificates(s._id);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              >
                <span className="font-medium text-foreground">
                  {s.firstName} {s.lastName}
                </span>
                <span className="text-xs text-foreground-muted">{s.admissionNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!selected ? (
        <Card className="p-10 text-center text-sm text-foreground-muted">Search for a student to issue or view certificates.</Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-sm font-semibold text-primary">
                  {initials(`${selected.firstName} ${selected.lastName}`)}
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    {selected.firstName} {selected.lastName}
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {selected.admissionNumber} &middot; {(selected.classId as ClassMaster)?.name} - {(selected.sectionId as Section)?.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setModalType("bonafide")}>
                  Bonafide
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModalType("fee_paid")}>
                  Fee Paid
                </Button>
                <Button size="sm" variant="outline" onClick={() => setModalType("transfer")}>
                  Transfer Certificate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Change
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            {certificates.length === 0 ? (
              <EmptyState title="No certificates issued yet" description="Use the buttons above to issue one." />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Serial No.</Th>
                    <Th>Type</Th>
                    <Th>Issued On</Th>
                    <Th>Status</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <tbody>
                  {certificates.map((c) => (
                    <Tr key={c._id}>
                      <Td className="font-mono text-xs">{c.serialNumber}</Td>
                      <Td className="capitalize">{c.type.replace("_", " ")}</Td>
                      <Td>{formatDate(c.issuedAt)}</Td>
                      <Td>
                        <Badge tone={c.status === "issued" ? "success" : "neutral"} className="capitalize">
                          {c.status}
                        </Badge>
                      </Td>
                      <Td>
                        <Link href={`/certificates/view/${c._id}`} target="_blank">
                          <Button size="sm" variant="ghost">
                            <FileBadge className="size-3.5" />
                            View
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {selected && modalType && (
        <IssueCertificateModal
          open={!!modalType}
          onClose={() => setModalType(null)}
          type={modalType}
          studentId={selected._id}
          onIssued={() => loadCertificates(selected._id)}
        />
      )}
    </div>
  );
}

function IdCardsTab() {
  const [kind, setKind] = useState<"student" | "staff">("student");
  const [q, setQ] = useState("");
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [staffResults, setStaffResults] = useState<Staff[]>([]);

  useEffect(() => {
    if (!q) {
      setStudentResults([]);
      setStaffResults([]);
      return;
    }
    const t = setTimeout(() => {
      if (kind === "student") {
        api.get<ApiResponse<Student[]>>("/students", { q, limit: 8 }).then((res) => setStudentResults(res.data));
      } else {
        api.get<ApiResponse<Staff[]>>("/staff").then((res) =>
          setStaffResults(res.data.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())))
        );
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant={kind === "student" ? "primary" : "outline"} onClick={() => setKind("student")}>
          Student
        </Button>
        <Button size="sm" variant={kind === "staff" ? "primary" : "outline"} onClick={() => setKind("staff")}>
          Staff
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
        <Input className="pl-9" placeholder={`Search ${kind}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-hidden p-0">
        {(kind === "student" ? studentResults.length : staffResults.length) === 0 ? (
          <EmptyState title={`No ${kind}s found`} description="Search by name to generate a printable ID card." />
        ) : (
          <div className="divide-y divide-border">
            {kind === "student"
              ? studentResults.map((s) => (
                  <div key={s._id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-foreground">
                      {s.firstName} {s.lastName} <span className="text-foreground-muted">({s.admissionNumber})</span>
                    </span>
                    <Link href={`/certificates/id-card/student/${s._id}`} target="_blank">
                      <Button size="sm" variant="outline">
                        <IdCardIcon className="size-3.5" />
                        Generate
                      </Button>
                    </Link>
                  </div>
                ))
              : staffResults.map((s) => (
                  <div key={s._id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-foreground">
                      {s.name} <span className="text-foreground-muted">({s.employeeId})</span>
                    </span>
                    <Link href={`/certificates/id-card/staff/${s._id}`} target="_blank">
                      <Button size="sm" variant="outline">
                        <IdCardIcon className="size-3.5" />
                        Generate
                      </Button>
                    </Link>
                  </div>
                ))}
          </div>
        )}
      </Card>
    </div>
  );
}
