import type { Metadata } from "next";
import { requireTenant } from "@/lib/tenant/context";
import { isCurrentUserAdmin } from "@/lib/auth";
import { isDemoMode, DEMO_USER_EMAIL, DEMO_USER_ID } from "@/config/demo";
import { getTenantMembers, type TenantMemberView } from "@/modules/users/queries";
import { formatDate } from "@/lib/utils/format";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InviteMemberDialog } from "@/modules/tenant/components/InviteMemberDialog";

export const metadata: Metadata = { title: "Membri" };

const roleLabel: Record<string, string> = {
  owner: "Proprietario",
  admin: "Admin",
  member: "Membro",
  viewer: "Visualizzatore",
};

function displayName(m: TenantMemberView): string {
  return m.fullName || m.email || `Utente ${m.userId.slice(0, 8)}`;
}

export default async function MembersPage() {
  await requireTenant();
  const canManage = await isCurrentUserAdmin();

  const members: TenantMemberView[] = isDemoMode()
    ? [
        {
          id: "demo",
          userId: DEMO_USER_ID,
          role: "owner",
          invitedAt: new Date().toISOString(),
          joinedAt: new Date().toISOString(),
          email: DEMO_USER_EMAIL,
          fullName: "Utente Demo",
        },
      ]
    : await getTenantMembers();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Membri del team</CardTitle>
          <CardDescription>
            Gestisci chi ha accesso a questa azienda e con quale ruolo.
          </CardDescription>
        </div>
        {canManage && <InviteMemberDialog />}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utente</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Iscritto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {displayName(m).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{displayName(m)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                    {roleLabel[m.role] ?? m.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.joinedAt ? formatDate(m.joinedAt) : "In attesa"}
                </TableCell>
              </TableRow>
            ))}
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Nessun membro ancora.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
