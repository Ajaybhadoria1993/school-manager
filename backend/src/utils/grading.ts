// Generic percentage -> grade scale, loosely modelled on CBSE's 9-point
// scale. Real deployments need this configurable per board (ICSE/State
// Board differ) — flagged in the FRD as a Phase-2 configuration item, so
// this is a reasonable MVP default rather than a board-accurate table.
const GRADE_BANDS: { min: number; grade: string }[] = [
  { min: 90, grade: "A1" },
  { min: 80, grade: "A2" },
  { min: 70, grade: "B1" },
  { min: 60, grade: "B2" },
  { min: 50, grade: "C1" },
  { min: 40, grade: "C2" },
  { min: 33, grade: "D" },
  { min: 0, grade: "E (Needs Improvement)" },
];

export function gradeForPercentage(percentage: number): string {
  const band = GRADE_BANDS.find((b) => percentage >= b.min);
  return band?.grade ?? "E (Needs Improvement)";
}
