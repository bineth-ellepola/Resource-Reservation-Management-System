import { redirect } from "next/navigation";

// The dashboard redirects to /login when there is no session.
export default function Home() {
  redirect("/dashboard");
}
