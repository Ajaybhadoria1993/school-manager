import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("school_erp_token")?.value;
  redirect(token ? "/dashboard" : "/login");
}
