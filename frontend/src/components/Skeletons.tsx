export function SkeletonCard() {
  return (
    <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 animate-pulse">
      <div className="h-6 bg-zinc-800 rounded-md w-3/4 mb-4"></div>
      <div className="h-4 bg-zinc-800/80 rounded-md w-full mb-2"></div>
      <div className="h-4 bg-zinc-800/80 rounded-md w-5/6 mb-6"></div>
      <div className="flex justify-between items-end">
        <div className="h-10 bg-zinc-800 rounded-md w-24"></div>
        <div className="h-6 bg-zinc-800 rounded-full w-20"></div>
      </div>
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="mb-12 animate-pulse">
      <div className="h-10 bg-zinc-800 rounded-md w-1/3 mb-4"></div>
      <div className="h-4 bg-zinc-800/80 rounded-md w-1/2"></div>
    </div>
  );
}
