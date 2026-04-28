"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HelpArticle {
  id: string;
  section_title: string;
  section_position: number;
  section_role: "manager" | "admin" | "super_admin" | null;
  question: string;
  answer: string;
  position: number;
}

interface Props {
  articles: HelpArticle[];
  isManager: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface Section {
  title: string;
  role: HelpArticle["section_role"];
  position: number;
  items: HelpArticle[];
}

function groupIntoSections(articles: HelpArticle[]): Section[] {
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

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-medium text-gray-900">{question}</span>
        <ChevronDown
          size={16}
          className={cn(
            "text-gray-400 transition-transform shrink-0 ml-2",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <p className="pb-3 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
          {answer}
        </p>
      )}
    </div>
  );
}

export function HelpContent({
  articles,
  isManager,
  isAdmin,
  isSuperAdmin,
}: Props) {
  const sections = useMemo(() => groupIntoSections(articles), [articles]);

  const visibleSections = sections.filter((s) => {
    if (!s.role) return true;
    if (s.role === "manager") return isManager;
    if (s.role === "admin") return isAdmin;
    if (s.role === "super_admin") return isSuperAdmin;
    return false;
  });

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => (
        <div
          key={section.title}
          className="rounded-xl border border-gray-200 bg-white p-6"
        >
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {section.title}
          </h2>
          {section.role && (
            <p className="mb-3 text-xs text-blue-600">
              {section.role === "manager"
                ? "Manager & above"
                : section.role === "admin"
                  ? "HR Admin & above"
                  : "Super Admin only"}
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {section.items.map((item) => (
              <Accordion key={item.id} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
