import type { Middleware } from "@reduxjs/toolkit";
import { academicsApi } from "../api/academicsApi";
import { attendanceApi } from "../api/attendanceApi";
import { classroomApi } from "../api/classroomApi";
import { examsApi } from "../api/examsApi";
import { studentsApi } from "../api/studentsApi";
import { timetableApi } from "../api/timetableApi";
import { sessionEnded, signedOut } from "../slices/authSlice";
import { YEAR_VIEW_KEY, yearViewChanged } from "../slices/yearViewSlice";

const remember = (yearId: string | null) => {
  try {
    if (yearId) sessionStorage.setItem(YEAR_VIEW_KEY, yearId);
    else sessionStorage.removeItem(YEAR_VIEW_KEY);
  } catch {
    // The tab just forgets the year when it reloads.
  }
};

/**
 * When the year being looked at changes (or the session ends and it is forgotten), the tab remembers it, and every read that can answer
 * for a year is asked again, so each screen shows the new year. What is not about a year (the list of years, the promotion list, the
 * people, the subjects, the timings, the calendar) is left alone. Only what is on screen is asked for: RTK Query drops the rest and reads it when it is next needed.
 */
export const yearViewMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  if (yearViewChanged.match(action)) {
    remember(action.payload);
    store.dispatch(academicsApi.util.invalidateTags(["Structure", "ClassList", "Class"]));
    store.dispatch(studentsApi.util.invalidateTags(["StudentList", "Student", "Capacity"]));
    store.dispatch(attendanceApi.util.invalidateTags(["StudentAttendance", "TeacherAttendance"]));
    store.dispatch(examsApi.util.invalidateTags(["Exams", "Exam", "ClassExams", "MarksSheet"]));
    // The timetable, what a class studies and a teacher's classes are a year's; the subjects' list, the timings and the calendar are not.
    store.dispatch(timetableApi.util.invalidateTags(["Teacher", "Allotment", "Overview", "TeacherWeek", "Grid"]));
    store.dispatch(classroomApi.util.invalidateTags(["Attendance", "Diary", "Tests"]));
  } else if (signedOut.match(action) || sessionEnded.match(action)) {
    remember(null);
  }
  return result;
};
