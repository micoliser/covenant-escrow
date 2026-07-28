"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when pathname changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

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
    <>
      <header className="fixed top-0 w-full z-50 px-4 md:px-6 py-3 md:py-4 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5">
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

          <div className="flex items-center gap-3 sm:gap-6">
            <NotificationsDropdown />
            <div className="hidden sm:block">
              <ConnectWallet />
            </div>
            
            <button 
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-zinc-950/95 backdrop-blur-xl transition-all duration-300 md:hidden flex flex-col pt-24 px-6",
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <nav className="flex flex-col gap-6 items-start w-full">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                "text-2xl font-display font-medium transition-colors w-full pb-4 border-b border-zinc-800/50 flex items-center justify-between",
                link.disabled 
                  ? "text-zinc-600 cursor-not-allowed pointer-events-none" 
                  : isLinkActive(link)
                    ? "text-white"
                    : "text-zinc-400 hover:text-white"
              )}
              aria-disabled={link.disabled}
              tabIndex={link.disabled ? -1 : (isMobileMenuOpen ? 0 : -1)}
            >
              {link.name}
              {link.disabled && (
                <span className="text-[10px] uppercase tracking-wider bg-zinc-800 text-zinc-500 px-2 py-1 rounded-sm">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </nav>
        
        <div className="mt-12 w-full flex justify-center sm:hidden">
          <ConnectWallet />
        </div>
      </div>
    </>
  );
}
