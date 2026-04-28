"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { HelpArticle } from "@/components/help/help-content";

type Role = "manager" | "admin" | "super_admin" | null;

interface Section {
  title: string;
  role: Role;
  position: number;
  items: HelpArticle[];
}

function groupSections(articles: HelpArticle[]): Section[] {
  const map = new Map<string, Section>();
  for (const a of articles) {
    let s = map.get(a.section_title);
    if (!s) {
      s = {
        title: a.section_title,
        role: a.section_role,
        position: a.section_position,
        items: [],
      };
      map.set(a.section_title, s);
    }
    s.items.push(a);
  }
  for (const s of map.values()) {
    s.items.sort((x, y) => x.position - y.position);
  }
  return [...map.values()].sort((a, b) => a.position - b.position);
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "manager", label: "Manager & above" },
  { value: "admin", label: "HR Admin & above" },
  { value: "super_admin", label: "Super Admin only" },
];

function roleToValue(r: Role): string {
  return r ?? "";
}
function valueToRole(v: string): Role {
  if (v === "manager" || v === "admin" || v === "super_admin") return v;
  return null;
}

export function HelpArticlesManager({ articles }: { articles: HelpArticle[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);

  const sections = groupSections(articles);

  const wrap = async (op: () => Promise<{ error: string | null }>) => {
    setBusy(true);
    setError("");
    const { error } = await op();
    if (error) setError(error);
    else router.refresh();
    setBusy(false);
  };

  // ---- Article operations ----
  const saveArticle = (id: string, patch: Partial<HelpArticle>) =>
    wrap(async () => {
      const { error } = await supabase
        .from("help_articles")
        .update(patch)
        .eq("id", id);
      return { error: error?.message ?? null };
    });

  const deleteArticle = (id: string) => {
    if (!confirm("Delete this Q&A?")) return;
    return wrap(async () => {
      const { error } = await supabase
        .from("help_articles")
        .delete()
        .eq("id", id);
      return { error: error?.message ?? null };
    });
  };

  const addArticleToSection = (section: Section) => {
    const nextPosition =
      section.items.length === 0
        ? 0
        : Math.max(...section.items.map((i) => i.position)) + 1;
    return wrap(async () => {
      const { error } = await supabase.from("help_articles").insert({
        section_title: section.title,
        section_position: section.position,
        section_role: section.role,
        question: "New question",
        answer: "Answer goes here.",
        position: nextPosition,
      });
      return { error: error?.message ?? null };
    });
  };

  const moveArticleWithinSection = (
    section: Section,
    article: HelpArticle,
    direction: -1 | 1
  ) => {
    const idx = section.items.findIndex((a) => a.id === article.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= section.items.length) return;
    const other = section.items[swapIdx];
    return wrap(async () => {
      const { error: e1 } = await supabase
        .from("help_articles")
        .update({ position: other.position })
        .eq("id", article.id);
      if (e1) return { error: e1.message };
      const { error: e2 } = await supabase
        .from("help_articles")
        .update({ position: article.position })
        .eq("id", other.id);
      return { error: e2?.message ?? null };
    });
  };

  // ---- Section operations ----
  const renameSection = (oldTitle: string, newTitle: string) => {
    if (!newTitle.trim() || newTitle === oldTitle) return;
    return wrap(async () => {
      const { error } = await supabase
        .from("help_articles")
        .update({ section_title: newTitle })
        .eq("section_title", oldTitle);
      return { error: error?.message ?? null };
    });
  };

  const updateSectionRole = (sectionTitle: string, role: Role) =>
    wrap(async () => {
      const { error } = await supabase
        .from("help_articles")
        .update({ section_role: role })
        .eq("section_title", sectionTitle);
      return { error: error?.message ?? null };
    });

  const deleteSection = (section: Section) => {
    if (
      !confirm(
        `Delete the entire "${section.title}" section and all ${section.items.length} Q&A inside?`
      )
    )
      return;
    return wrap(async () => {
      const { error } = await supabase
        .from("help_articles")
        .delete()
        .eq("section_title", section.title);
      return { error: error?.message ?? null };
    });
  };

  const moveSection = (section: Section, direction: -1 | 1) => {
    const idx = sections.findIndex((s) => s.title === section.title);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const other = sections[swapIdx];
    return wrap(async () => {
      const { error: e1 } = await supabase
        .from("help_articles")
        .update({ section_position: other.position })
        .eq("section_title", section.title);
      if (e1) return { error: e1.message };
      const { error: e2 } = await supabase
        .from("help_articles")
        .update({ section_position: section.position })
        .eq("section_title", other.title);
      return { error: e2?.message ?? null };
    });
  };

  const addSection = (title: string, role: Role) => {
    if (!title.trim()) return;
    const nextSectionPos =
      sections.length === 0
        ? 0
        : Math.max(...sections.map((s) => s.position)) + 1;
    return wrap(async () => {
      const { error } = await supabase.from("help_articles").insert({
        section_title: title,
        section_position: nextSectionPos,
        section_role: role,
        question: "New question",
        answer: "Answer goes here.",
        position: 0,
      });
      if (!error) setShowAddSection(false);
      return { error: error?.message ?? null };
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAddSection((v) => !v)}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} />
          {showAddSection ? "Cancel" : "Add Section"}
        </button>
      </div>

      {showAddSection && (
        <AddSectionForm onSubmit={addSection} disabled={busy} />
      )}

      {sections.map((section, sIdx) => (
        <SectionCard
          key={section.title}
          section={section}
          isFirst={sIdx === 0}
          isLast={sIdx === sections.length - 1}
          busy={busy}
          onRename={(newTitle) => renameSection(section.title, newTitle)}
          onRoleChange={(role) => updateSectionRole(section.title, role)}
          onMove={(dir) => moveSection(section, dir)}
          onDelete={() => deleteSection(section)}
          onAddArticle={() => addArticleToSection(section)}
          onSaveArticle={saveArticle}
          onDeleteArticle={deleteArticle}
          onMoveArticle={(article, dir) =>
            moveArticleWithinSection(section, article, dir)
          }
        />
      ))}
    </div>
  );
}

function AddSectionForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (title: string, role: Role) => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<Role>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(title, role);
        setTitle("");
        setRole(null);
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="block text-xs font-medium text-gray-600">
          Section title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">
          Visible to
        </label>
        <select
          value={roleToValue(role)}
          onChange={(e) => setRole(valueToRole(e.target.value))}
          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Create
      </button>
    </form>
  );
}

function SectionCard({
  section,
  isFirst,
  isLast,
  busy,
  onRename,
  onRoleChange,
  onMove,
  onDelete,
  onAddArticle,
  onSaveArticle,
  onDeleteArticle,
  onMoveArticle,
}: {
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onRename: (newTitle: string) => void;
  onRoleChange: (role: Role) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onAddArticle: () => void;
  onSaveArticle: (id: string, patch: Partial<HelpArticle>) => void;
  onDeleteArticle: (id: string) => void;
  onMoveArticle: (article: HelpArticle, direction: -1 | 1) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const titleDirty = title !== section.title;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-gray-100 pb-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-600">
            Section title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            Visible to
          </label>
          <select
            value={roleToValue(section.role)}
            onChange={(e) => onRoleChange(valueToRole(e.target.value))}
            disabled={busy}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onRename(title)}
          disabled={busy || !titleDirty || !title.trim()}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Save Title
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={busy || isFirst}
            title="Move section up"
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={busy || isLast}
            title="Move section down"
            className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
          >
            <ArrowDown size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Delete entire section"
          className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-3">
        {section.items.map((article, aIdx) => (
          <ArticleRow
            key={article.id}
            article={article}
            isFirst={aIdx === 0}
            isLast={aIdx === section.items.length - 1}
            busy={busy}
            onSave={(patch) => onSaveArticle(article.id, patch)}
            onDelete={() => onDeleteArticle(article.id)}
            onMove={(dir) => onMoveArticle(article, dir)}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAddArticle}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus size={14} />
          Add Q&amp;A
        </button>
      </div>
    </div>
  );
}

function ArticleRow({
  article,
  isFirst,
  isLast,
  busy,
  onSave,
  onDelete,
  onMove,
}: {
  article: HelpArticle;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onSave: (patch: Partial<HelpArticle>) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [question, setQuestion] = useState(article.question);
  const [answer, setAnswer] = useState(article.answer);
  const dirty = question !== article.question || answer !== article.answer;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={3}
        className="mt-2 w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ question, answer })}
          disabled={busy || !dirty || !question.trim()}
          className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={busy || isFirst}
          title="Move up"
          className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={busy || isLast}
          title="Move down"
          className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-30"
        >
          <ArrowDown size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Delete Q&A"
          className="ml-auto rounded border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
