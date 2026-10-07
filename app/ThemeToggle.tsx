"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
export function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next;
    try { localStorage.setItem("syncedin-theme", next); } catch { /* optional persistence */ }
  }}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
