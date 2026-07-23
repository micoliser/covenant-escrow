export function Footer() {
  return (
    <footer className="px-6 py-8 border-t border-zinc-800/50 bg-zinc-950 text-center">
      <p className="text-foreground/50 text-sm flex items-center justify-center gap-2">
        <span>Powered by GenLayer</span>
        <span>&bull;</span>
        <a
          href="https://github.com/micoliser/covenant-escrow"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors"
        >
          GitHub Repository
        </a>
      </p>
    </footer>
  );
}
