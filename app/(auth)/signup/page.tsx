import { redirect } from "next/navigation";

export default function SignupPage() {
  // Signups are disabled - this is a personal deployment
  redirect("/login?message=signups-disabled");
}
