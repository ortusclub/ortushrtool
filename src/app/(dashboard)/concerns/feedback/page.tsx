import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FeedbackForm } from "@/components/concerns/feedback-form";

export default function FeedbackPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/concerns"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} />
          Back to Report a Concern
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Anonymous Feedback</h1>
        <p className="text-gray-600">
          We do not store any link between you and this message. Only HR can
          read it.
        </p>
      </div>

      <FeedbackForm />
    </div>
  );
}
