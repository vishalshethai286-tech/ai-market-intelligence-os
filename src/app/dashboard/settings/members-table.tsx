type Member = {
  id: string;
  status: string;
  user: { name: string | null; email: string };
  role: { name: string };
};

export function MembersTable({ members }: { members: Member[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.145]">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/[.02] dark:bg-white/[.04]">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-t border-black/[.08] dark:border-white/[.145]">
              <td className="px-4 py-2">{member.user.name ?? "—"}</td>
              <td className="px-4 py-2 text-black/60 dark:text-white/60">{member.user.email}</td>
              <td className="px-4 py-2">{member.role.name}</td>
              <td className="px-4 py-2 text-black/60 dark:text-white/60">{member.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
