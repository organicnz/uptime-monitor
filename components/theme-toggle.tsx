"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// Helper to safely access localStorage
function getThemeFromStorage(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("theme") as "light" | "dark") || "dark";
}

// Subscribe function for useSyncExternalStore
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

// Server snapshot always returns dark
function getServerSnapshot(): "light" | "dark" {
  return "dark";
}

export function ThemeToggle() {
  // Use useSyncExternalStore for hydration-safe localStorage access
  const storedTheme = useSyncExternalStore(
    subscribe,
    getThemeFromStorage,
    getServerSnapshot,
  );

  const [theme, setThemeState] = useState<"light" | "dark">(storedTheme);

  const setTheme = (newTheme: "light" | "dark") => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    const root = document.documentElement;
    if (newTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="h-9 w-9"
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4 text-yellow-500" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
