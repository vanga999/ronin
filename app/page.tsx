import { getDashboardData } from "@/lib/dashboard";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard initialData={getDashboardData()} />;
}
