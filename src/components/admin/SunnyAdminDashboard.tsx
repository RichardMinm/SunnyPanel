import { redirect } from "next/navigation";

/** Admin 首页策略 B：内容管理入口统一到 Dashboard，/admin 仅用于编辑 */
export function SunnyAdminDashboard() {
  redirect("/dashboard");
}
