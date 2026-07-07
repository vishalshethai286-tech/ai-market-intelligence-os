import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Member = {
  id: string;
  status: string;
  user: { name: string | null; email: string };
  role: { name: string };
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "default"> = {
  ACTIVE: "success",
  INVITED: "warning",
  SUSPENDED: "default",
};

export function MembersTable({ members }: { members: Member[] }) {
  return (
    <div className="mt-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.user.name ?? "—"}</TableCell>
              <TableCell className="text-black/60 dark:text-white/60">{member.user.email}</TableCell>
              <TableCell>
                <Badge variant="outline">{member.role.name}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[member.status] ?? "default"}>{member.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
