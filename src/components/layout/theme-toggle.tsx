"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  // Start matching SSR (no class assumed); sync to the real state on mount so
  // the icon is correct after the no-flash script has run.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore storage failures */
    }
  };

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle dark mode"
      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
