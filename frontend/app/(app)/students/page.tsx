"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAcademicSetup } from "@/lib/hooks/useAcademicSetup";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Tr, Th, Td, EmptyState } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { StudentFormModal } from "@/components/students/StudentFormModal";
import { formatDate } from "@/lib/utils";
import type { ApiResponse, ClassMaster, Section, Student } from "@/types";

const CAN_ADMIT: Array<string> = ["super_admin", "school_admin", "principal"];

export default function StudentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { classes } = useAcademicSetup();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<ApiResponse<Student[]>>("/students", {
      q: q || undefined,
      classId: classId || undefined,
      limit: 50,
    });
    setStudents(res.data);
    setLoading(false);
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, classId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Students</h2>
          <p className="text-sm text-foreground-muted">Admissions, class rosters and student profiles.</p>
        </div>
        {user && CAN_ADMIT.includes(user.role) && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="size-4" />
            Admit Student
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            className="pl-9"
            placeholder="Search by name or admission number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="sm:w-56" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="p-6 text-sm text-foreground-muted">Loading students…</div>
        ) : students.length === 0 ? (
          <EmptyState title="No students found" description="Try a different search, or admit a new student." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Admission No.</Th>
                <Th>Name</Th>
                <Th>Class</Th>
                <Th>Gender</Th>
                <Th>Status</Th>
                <Th>Admitted On</Th>
              </Tr>
            </Thead>
            <tbody>
              {students.map((s) => (
                <Tr
                  key={s._id}
                  className="cursor-pointer hover:bg-surface-muted"
                  onClick={() => router.push(`/students/${s._id}`)}
                >
                  <Td className="font-mono text-xs">{s.admissionNumber}</Td>
                  <Td className="font-medium">
                    {s.firstName} {s.lastName}
                    {s.rollNumber && <span className="ml-1.5 text-xs text-foreground-muted">#{s.rollNumber}</span>}
                  </Td>
                  <Td>
                    {(s.classId as ClassMaster)?.name} - {(s.sectionId as Section)?.name}
                  </Td>
                  <Td className="capitalize">{s.gender}</Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "success" : "neutral"} className="capitalize">
                      {s.status}
                    </Badge>
                  </Td>
                  <Td>{formatDate(s.createdAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <StudentFormModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={() => load()} />
    </div>
  );
}
