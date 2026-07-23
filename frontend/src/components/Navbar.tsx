"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { name: "DAOs", href: "/dao/1" },
    { name: "Proposals", href: "/dao/1" },
    { name: "Treasury", href: "#", disabled: true },
  ];

  return (
    <header className="fixed top-0 w-full z-50 px-6 py-4 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="text-xl font-display font-bold tracking-tight text-white hover:text-accent transition-colors flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <span className="text-white font-bold text-lg leading-none">C</span>
            </div>
            Covenant
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors",
                  link.disabled 
                    ? "text-zinc-600 cursor-not-allowed pointer-events-none" 
                    : pathname === link.href || (link.name === "Proposals" && pathname.includes("/proposal"))
                      ? "text-white"
                      : "text-zinc-400 hover:text-white"
                )}
                aria-disabled={link.disabled}
                tabIndex={link.disabled ? -1 : 0}
              >
                {link.name}
                {link.disabled && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-sm">
                    Soon
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-6">
          <button 
            className="text-zinc-500 cursor-not-allowed pointer-events-none relative"
            title="Notifications (Coming Soon)"
            disabled
          >
            <Bell className="w-5 h-5" />
          </button>
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
