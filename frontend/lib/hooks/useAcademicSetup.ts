"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AcademicYear, ApiResponse, ClassMaster, Section } from "@/types";

export function useAcademicSetup() {
  const [classes, setClasses] = useState<ClassMaster[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [classesRes, sectionsRes, yearsRes] = await Promise.all([
        api.get<ApiResponse<ClassMaster[]>>("/academics/classes"),
        api.get<ApiResponse<Section[]>>("/academics/sections"),
        api.get<ApiResponse<AcademicYear[]>>("/academic-years"),
      ]);
      if (cancelled) return;
      setClasses(classesRes.data);
      setSections(sectionsRes.data);
      setAcademicYears(yearsRes.data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeAcademicYear = academicYears.find((y) => y.isActive) ?? academicYears[0];
  const sectionsForClass = (classId: string) => sections.filter((s) => s.classId === classId);

  return { classes, sections, academicYears, activeAcademicYear, sectionsForClass, loading };
}
