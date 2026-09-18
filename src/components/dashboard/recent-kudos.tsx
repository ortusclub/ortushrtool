import { format, parseISO } from "date-fns";
import { Heart } from "lucide-react";
import Link from "next/link";
import { displayName } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { KudosWithUsers } from "@/types/database";

export function RecentKudos({ kudos }: { kudos: KudosWithUsers[] }) {
  if (kudos.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gray-500">
          <Heart size={14} className="text-rose-500" />
          Recent Kudos
        </h2>
        <Link
          href="/performance"
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          See all →
        </Link>
      </div>
      <ul className="space-y-3">
        {kudos.map((k) => (
          <li
            key={k.id}
            className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
          >
            <UserAvatar
              name={displayName(k.sender ?? null)}
              avatarUrl={null}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800">
                <strong className="text-gray-900">
                  {displayName(k.sender ?? null)}
                </strong>
                {" → "}
                <strong className="text-gray-900">
                  {displayName(k.recipient ?? null)}
                </strong>
              </p>
              <p className="mt-0.5 text-xs italic text-gray-600">
                &ldquo;{k.message}&rdquo;
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {format(parseISO(k.created_at), "MMM d")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
