"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Save, ChevronDown, RotateCcw, Eye, EyeOff, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailTemplate } from "@/types/database";
import { EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email/template-defaults";
import { UNIVERSAL_VARIABLES } from "@/lib/email/universal-vars";
import { TEMPLATE_META } from "@/lib/email/template-meta";
import { RichTextEditor } from "./rich-text-editor";

export function EmailTemplateEditor({
  templates,
  toggles: initialToggles,
}: {
  templates: EmailTemplate[];
  toggles: Record<string, boolean>;
}) {
  const router = useRouter();
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState<Record<string, string>>({});
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>(initialToggles);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const handleToggle = async (key: string) => {
    const next = !toggles[key];
    setTogglingKey(key);
    setToggles((prev) => ({ ...prev, [key]: next }));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("system_settings").upsert({
      key,
      value: next ? "true" : "false",
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setToggles((prev) => ({ ...prev, [key]: !next }));
      setMessage(`Could not save toggle: ${error.message}`);
    }
    setTogglingKey(null);
  };

  // Merge DB templates with defaults so all templates are shown
  const merged = EMAIL_TEMPLATE_DEFAULTS.map((def) => {
    const dbTemplate = templates.find((t) => t.type === def.type);
    return dbTemplate ?? { ...def, updated_by: null, updated_at: "" };
  });

  const [edits, setEdits] = useState<
    Record<string, { subject: string; body: string }>
  >({});

  const getEdited = (tmpl: EmailTemplate) =>
    edits[tmpl.type] ?? { subject: tmpl.subject, body: tmpl.body };

  const setField = (
    type: string,
    field: "subject" | "body",
    value: string
  ) => {
    setEdits((prev) => ({
      ...prev,
      [type]: { ...getEdited(merged.find((t) => t.type === type)!), [field]: value },
    }));
  };

  const handleSave = async (tmpl: EmailTemplate) => {
    setSaving(tmpl.type);
    setMessage("");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const edited = getEdited(tmpl);

    await supabase.from("email_templates").upsert({
      type: tmpl.type,
      name: tmpl.name,
      subject: edited.subject,
      body: edited.body,
      variables: tmpl.variables,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    });

    setMessage(`"${tmpl.name}" saved.`);
    setSaving(null);
    router.refresh();
  };

  const handleSendTest = async (tmpl: EmailTemplate) => {
    const to = (testRecipient[tmpl.type] ?? "").trim();
    if (!to) {
      setMessage("Enter a recipient email to send a test.");
      return;
    }
    setSendingTest(tmpl.type);
    setMessage("");
    const edited = getEdited(tmpl);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_email: to,
          subject: edited.subject,
          body: edited.body,
          variables: tmpl.variables,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Test send failed: ${data.error || res.statusText}`);
      } else {
        setMessage(`Test "${tmpl.name}" sent to ${to}.`);
      }
    } catch (err) {
      setMessage(
        `Test send failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setSendingTest(null);
    }
  };

  const handleReset = (type: string) => {
    const def = EMAIL_TEMPLATE_DEFAULTS.find((t) => t.type === type);
    if (def) {
      setEdits((prev) => ({
        ...prev,
        [type]: { subject: def.subject, body: def.body },
      }));
    }
  };

  // Group templates by category
  const groups: { label: string; types: string[] }[] = [
    {
      label: "Authentication",
      types: ["welcome", "password_reset", "forgot_password_alert"],
    },
    {
      label: "Leave Requests",
      types: ["leave_submitted", "leave_approved", "leave_rejected"],
    },
    {
      label: "Schedule Adjustments",
      types: ["adjustment_submitted", "adjustment_approved", "adjustment_rejected"],
    },
    {
      label: "Holiday Work",
      types: ["holiday_work_submitted", "holiday_work_approved", "holiday_work_rejected"],
    },
    {
      label: "Attendance & Reminders",
      types: ["attendance_flag", "reminder"],
    },
    {
      label: "Celebrations",
      types: [
        "birthday_greeting_regular",
        "birthday_greeting_probationary",
        "work_anniversary",
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {message && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.types.map((type) => {
              const tmpl = merged.find((t) => t.type === type);
              if (!tmpl) return null;
              const edited = getEdited(tmpl);
              const isExpanded = expandedType === type;
              const isPreviewing = previewing === type;
              const meta = TEMPLATE_META[type];
              const toggleEnabled = meta?.toggleKey
                ? toggles[meta.toggleKey] ?? false
                : null;

              return (
                <div
                  key={type}
                  className="rounded-xl border border-gray-200 bg-white"
                >
                  <button
                    onClick={() =>
                      setExpandedType(isExpanded ? null : type)
                    }
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {tmpl.name}
                        </p>
                        {toggleEnabled === false && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                            Off
                          </span>
                        )}
                        {toggleEnabled === true && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-700">
                            On
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-400">{edited.subject}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "ml-3 shrink-0 text-gray-400 transition-transform",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                      {meta?.sentWhen && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
                            Sent when
                          </p>
                          <p className="mt-0.5 text-xs text-blue-900">{meta.sentWhen}</p>
                        </div>
                      )}

                      {meta?.toggleKey && (
                        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <label className="text-sm font-medium text-gray-700">
                            {meta.toggleLabel ?? "Enabled"}
                          </label>
                          <button
                            type="button"
                            onClick={() => handleToggle(meta.toggleKey!)}
                            disabled={togglingKey === meta.toggleKey}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50",
                              toggleEnabled ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                toggleEnabled ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Subject
                        </label>
                        <input
                          type="text"
                          value={edited.subject}
                          onChange={(e) =>
                            setField(type, "subject", e.target.value)
                          }
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-gray-700">
                            Body
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewing(isPreviewing ? null : type)
                            }
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            {isPreviewing ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                            {isPreviewing ? "Edit" : "Preview"}
                          </button>
                        </div>
                        {isPreviewing ? (
                          <div
                            className="mt-1 rounded-lg border border-gray-200 bg-gray-50 p-4"
                            dangerouslySetInnerHTML={{ __html: edited.body }}
                          />
                        ) : (
                          <div className="mt-1">
                            <RichTextEditor
                              value={edited.body}
                              onChange={(html) => setField(type, "body", html)}
                              universalVariables={[...UNIVERSAL_VARIABLES]}
                              variables={tmpl.variables
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean)
                                .filter(
                                  (v) =>
                                    !(UNIVERSAL_VARIABLES as readonly string[]).includes(v)
                                )}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-gray-400">
                          Use the <strong>Insert variable</strong> menu to drop in placeholders. Switch to{" "}
                          <strong>HTML</strong> mode for advanced formatting or {"{{#if variable}}"}...{"{{/if}}"} conditionals.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSave(tmpl)}
                          disabled={saving === type}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <Save size={14} />
                          {saving === type ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => handleReset(type)}
                          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <RotateCcw size={14} />
                          Reset to Default
                        </button>
                      </div>

                      <div className="border-t border-gray-100 pt-4">
                        <label className="block text-sm font-medium text-gray-700">
                          Send a test
                        </label>
                        <p className="text-xs text-gray-500">
                          Sends the current (unsaved) subject and body, with{" "}
                          <code>[var_name]</code> placeholders filling in for any variables.
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="email"
                            placeholder="recipient@example.com"
                            value={testRecipient[type] ?? ""}
                            onChange={(e) =>
                              setTestRecipient((prev) => ({
                                ...prev,
                                [type]: e.target.value,
                              }))
                            }
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleSendTest(tmpl)}
                            disabled={sendingTest === type}
                            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Send size={14} />
                            {sendingTest === type ? "Sending..." : "Send Test"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
