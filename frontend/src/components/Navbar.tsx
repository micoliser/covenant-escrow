"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { NotificationsDropdown } from "./NotificationsDropdown";

export function Navbar() {
  const pathname = usePathname();

  const navLinks: { name: string; href: string; disabled?: boolean }[] = [
    { name: "DAOs", href: "/daos" },
    { name: "Proposals", href: "/proposals" },
    { name: "Treasury", href: "/treasury" },
  ];

  const isLinkActive = (link: typeof navLinks[0]) => {
    if (link.disabled) return false;
    if (link.name === "DAOs") return pathname === "/daos" || pathname.startsWith("/dao/");
    if (link.name === "Proposals") return pathname === "/proposals" || pathname.startsWith("/proposal/");
    if (link.name === "Treasury") return pathname === "/treasury" || pathname.includes("/treasury");
    return pathname === link.href;
  };

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
                    : isLinkActive(link)
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
          <NotificationsDropdown />
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
