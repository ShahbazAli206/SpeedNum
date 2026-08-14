"use client";

/**
 * MS-Word-like rich text editor for engagement-letter Terms & Conditions.
 *
 * Built on Tiptap (headless — we own every pixel of the toolbar) rather than
 * hand-rolled contentEditable/execCommand, which is deprecated and behaves
 * inconsistently across browsers for exactly the features this needs (lists,
 * indentation, tables). Always resolves to/from a plain HTML string so the
 * backend's `terms_html` column stays a portable string, not editor state.
 */

import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/cn";

const TEXT_COLORS = ["#0f172a", "#dc2626", "#0a8f4e", "#1266f1", "#7c3aed", "#b45309"];
const HIGHLIGHT_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa"];

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-ink-soft transition",
        "hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-brand-soft text-brand" : null,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
}

function ColorSwatchMenu({
  colors,
  onPick,
  label,
  icon,
}: {
  colors: string[];
  onPick: (color: string) => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <ToolbarButton onClick={() => {}} label={label}>
        {icon}
      </ToolbarButton>
      <div className="invisible absolute top-full left-0 z-30 mt-1 flex gap-1 rounded-lg border border-line bg-surface p-1.5 opacity-0 shadow-[var(--shadow-lift)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label}: ${color}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color)}
            className="size-5 rounded-full ring-1 ring-line-strong ring-inset transition hover:scale-110"
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2/60 px-2 py-1.5">
      <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="size-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>

      <Divider />

      <ColorSwatchMenu
        label="Text color"
        icon={<Palette className="size-4" />}
        colors={TEXT_COLORS}
        onPick={(color) => editor.chain().focus().setColor(color).run()}
      />
      <ColorSwatchMenu
        label="Highlight"
        icon={<Highlighter className="size-4" />}
        colors={HIGHLIGHT_COLORS}
        onPick={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
      />

      <Divider />

      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="size-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton label="Insert link" active={editor.isActive("link")} onClick={setLink}>
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Remove link"
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive("link")}
      >
        <Link2Off className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Table2 className="size-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting className="size-4" />
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: false },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    editorProps: {
      attributes: {
        class: "engagement-terms-editor prose-editor min-h-40 px-4 py-3 text-[13.5px] text-ink-soft focus:outline-none",
      },
    },
  });

  // Keep the editor in sync when `value` changes from outside (e.g. loading a
  // letter to edit) without clobbering the cursor on every local keystroke.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
