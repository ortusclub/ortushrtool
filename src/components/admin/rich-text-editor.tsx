"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Code,
  Eye,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "visual" | "code";

export function RichTextEditor({
  value,
  onChange,
  variables = [],
  universalVariables = [],
}: {
  value: string;
  onChange: (html: string) => void;
  variables?: string[];
  universalVariables?: string[];
}) {
  const [mode, setMode] = useState<Mode>("visual");
  const [showVarMenu, setShowVarMenu] = useState(false);
  const varMenuRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Image.configure({
        HTMLAttributes: {
          style: "max-width: 100%; height: auto; display: block; margin: 12px 0;",
        },
      }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: [
          "min-h-[240px] max-h-[480px] overflow-y-auto",
          "rounded-b-lg border border-t-0 border-gray-300 bg-white px-3 py-2 text-sm",
          "focus:outline-none",
          "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold",
          "[&_p]:my-2",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_a]:text-blue-600 [&_a]:underline",
          "[&_strong]:font-semibold",
        ].join(" "),
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current) {
      editor.commands.setContent(value, { emitUpdate: false });
      lastEmittedRef.current = value;
    }
  }, [value, editor]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (varMenuRef.current && !varMenuRef.current.contains(e.target as Node)) {
        setShowVarMenu(false);
      }
    }
    if (showVarMenu) {
      document.addEventListener("mousedown", onClickOutside);
      return () => document.removeEventListener("mousedown", onClickOutside);
    }
  }, [showVarMenu]);

  const insertVariable = (name: string) => {
    if (mode === "visual" && editor) {
      editor.chain().focus().insertContent(`{{${name}}}`).run();
    } else {
      const insertion = `{{${name}}}`;
      onChange(value + insertion);
    }
    setShowVarMenu(false);
  };

  const insertImage = () => {
    if (!editor) return;
    const url = window.prompt("Image URL (https://...)");
    if (!url) return;
    const alt = window.prompt("Alt text (for accessibility)", "") || "";
    editor.chain().focus().setImage({ src: url, alt }).run();
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL (leave empty to remove)", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  const ToolbarButton = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100",
        active && "bg-gray-200 text-gray-900"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-lg">
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-gray-300 bg-gray-50 px-2 py-1">
        {mode === "visual" && editor && (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              title="Bold"
            >
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              title="Italic"
            >
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              active={editor.isActive("heading", { level: 2 })}
              title="Heading"
            >
              <Heading2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              title="Bullet list"
            >
              <List size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
              title="Numbered list"
            >
              <ListOrdered size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={setLink}
              active={editor.isActive("link")}
              title="Link"
            >
              <LinkIcon size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={insertImage} title="Insert image">
              <ImageIcon size={14} />
            </ToolbarButton>
            <span className="mx-1 h-4 w-px bg-gray-300" />
          </>
        )}

        {(universalVariables.length > 0 || variables.length > 0) && (
          <div className="relative" ref={varMenuRef}>
            <button
              type="button"
              onClick={() => setShowVarMenu((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
              title="Insert a variable placeholder"
            >
              Insert variable <ChevronDown size={12} />
            </button>
            {showVarMenu && (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {universalVariables.length > 0 && (
                  <>
                    <p className="bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Universal
                    </p>
                    {universalVariables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="block w-full px-3 py-2 text-left font-mono text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </>
                )}
                {variables.length > 0 && (
                  <>
                    <p className="bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      This template
                    </p>
                    {variables.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="block w-full px-3 py-2 text-left font-mono text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setMode(mode === "visual" ? "code" : "visual")}
            className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            title={
              mode === "visual"
                ? "Switch to raw HTML editor"
                : "Switch to visual editor"
            }
          >
            {mode === "visual" ? (
              <>
                <Code size={12} /> HTML
              </>
            ) : (
              <>
                <Eye size={12} /> Visual
              </>
            )}
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea
          value={value}
          onChange={(e) => {
            lastEmittedRef.current = e.target.value;
            onChange(e.target.value);
          }}
          rows={14}
          className="block w-full rounded-b-lg border border-t-0 border-gray-300 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}
    </div>
  );
}
