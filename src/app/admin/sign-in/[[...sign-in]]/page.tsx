import { SignIn } from "@clerk/nextjs";

export default function AdminSignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <SignIn path="/admin/sign-in" />
    </div>
  );
}
