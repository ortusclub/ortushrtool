import Link from "next/link";
import {
  Flag,
  Clock,
  FileText,
  Users,
  ArrowUpRight,
} from "lucide-react";

// Only surfaces with REAL filter+export UIs already on the page they link to.
// For request types (leave / OT / adjustments / holiday-work) and balances,
// use the Custom Report Builder below — there's no per-page export there.
const QUICK_EXPORTS: {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}[] = [
  {
    label: "Attendance flags",
    description: "Late / early / absent records — filter and export.",
    href: "/flags",
    icon: <Flag size={16} className="text-red-500" />,
  },
  {
    label: "All attendance",
    description: "Daily clock-in / clock-out logs across the company.",
    href: "/attendance/all",
    icon: <Clock size={16} className="text-blue-500" />,
  },
  {
    label: "Users",
    description: "Full user list (CSV) from User Management.",
    href: "/admin/users",
    icon: <Users size={16} className="text-purple-500" />,
  },
  {
    label: "Document requests",
    description: "Filter by type, status, date — and export the matches.",
    href: "/admin/document-requests",
    icon: <FileText size={16} className="text-indigo-500" />,
  },
];

export function QuickExports() {
  return (
    <section>
      <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-gray-500">
        Quick Exports
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_EXPORTS.map((x) => (
          <Link
            key={x.label + x.href}
            href={x.href}
            className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <div className="shrink-0">{x.icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">{x.label}</p>
              <p className="mt-0.5 text-xs text-gray-500">{x.description}</p>
            </div>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-gray-400 transition-colors group-hover:text-blue-600"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
