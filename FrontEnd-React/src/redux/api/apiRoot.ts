import { academicsApi } from "./academicsApi";
import { authApi } from "./authApi";
import { classroomApi } from "./classroomApi";
import { notificationsApi } from "./notificationsApi";
import { onboardingApi } from "./onboardingApi";
import { parentApi } from "./parentApi";
import { studentsApi } from "./studentsApi";
import { tenantApi } from "./tenantApi";
import { timetableApi } from "./timetableApi";

/**
 * Every RTK Query slice of the app. store.ts builds the reducers and the middleware from this list, so a new
 * slice (src/redux/api/*Api.ts) must be added here or it is never wired in.
 */
export const allApiSlices = [authApi, tenantApi, onboardingApi, academicsApi, studentsApi, timetableApi, parentApi, classroomApi, notificationsApi];
