"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";
import { useState, useEffect } from "react";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    
    // Initial check
    handleScroll();
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 w-full z-50 px-6 transition-all duration-300 ${
        isScrolled 
          ? "py-4 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/50" 
          : "py-6 bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-display font-bold tracking-tight hover:text-accent transition-colors">
          Covenant Escrow
        </Link>
        <div className="flex items-center gap-4">
          <ConnectWallet />
        </div>
      </div>
    </header>
  );
}
