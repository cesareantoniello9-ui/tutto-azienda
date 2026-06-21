import Link from "next/link";
import { Building2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-xl font-bold tracking-tight">
        <Building2 className="size-6 text-primary" />
        Tutto.Azienda
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
