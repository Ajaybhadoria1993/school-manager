import { Request, Response } from "express";
import { Student } from "../models/Student";
import { Staff } from "../models/Staff";
import { Attendance } from "../models/Attendance";
import { FeeTransaction } from "../models/Fee";
import { Tenant } from "../models/Tenant";
import { asyncHandler } from "../utils/asyncHandler";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  if (req.query.branchId) filter.branchId = req.query.branchId;
  else if (req.user?.branchId) filter.branchId = req.user.branchId;
  return filter;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
}

// School-level operational dashboard (Admin/Principal home screen):
// today's attendance, fee collection this month, active headcounts.
export const schoolDashboard = asyncHandler(async (req: Request, res: Response) => {
  const filter = scopeFilter(req);
  const today = startOfDay();

  const [studentCount, staffCount, todayAttendance, monthCollection, recentTransactions] = await Promise.all([
    Student.countDocuments({ ...filter, status: "active" }),
    Staff.countDocuments({ ...filter, isActive: true }),
    Attendance.aggregate([
      { $match: { ...filter, date: today } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    FeeTransaction.aggregate([
      { $match: { ...filter, status: "success", paidAt: { $gte: startOfMonth() } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    FeeTransaction.find({ ...filter, status: "success" })
      .populate("studentId", "firstName lastName")
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  const presentToday = todayAttendance.find((a) => a._id === "present")?.count ?? 0;
  const absentToday = todayAttendance.find((a) => a._id === "absent")?.count ?? 0;
  const totalMarkedToday = todayAttendance.reduce((sum, a) => sum + a.count, 0);

  res.json({
    success: true,
    data: {
      studentCount,
      staffCount,
      attendanceToday: {
        present: presentToday,
        absent: absentToday,
        totalMarked: totalMarkedToday,
        percentage: totalMarkedToday === 0 ? null : Math.round((presentToday / totalMarkedToday) * 1000) / 10,
      },
      feeCollectionThisMonth: monthCollection[0]?.total ?? 0,
      recentTransactions,
    },
  });
});

// Platform-level dashboard for the Super Admin control panel (FR-10.4).
export const platformDashboard = asyncHandler(async (_req: Request, res: Response) => {
  const [totalTenants, activeTenants, tierBreakdown, totalStudents] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    Tenant.aggregate([{ $group: { _id: "$subscriptionTier", count: { $sum: 1 } } }]),
    Student.countDocuments({ status: "active" }),
  ]);

  res.json({
    success: true,
    data: { totalTenants, activeTenants, tierBreakdown, totalStudents },
  });
});
