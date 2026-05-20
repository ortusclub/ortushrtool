export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-11/12 rounded bg-gray-100" />
          <div className="h-4 w-10/12 rounded bg-gray-100" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-9/12 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
