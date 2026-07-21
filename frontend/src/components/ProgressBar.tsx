import { formatGen } from '@/lib/formatGen';

interface ProgressBarProps {
  yesWeight: string;
  noWeight: string;
}

export function ProgressBar({ yesWeight, noWeight }: ProgressBarProps) {
  const yes = parseFloat(formatGen(yesWeight));
  const no = parseFloat(formatGen(noWeight));
  const total = yes + no;

  const yesPercent = total > 0 ? (yes / total) * 100 : 0;
  const noPercent = total > 0 ? (no / total) * 100 : 0;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm font-medium">
        <span className="text-emerald-400">Yes: {formatGen(yesWeight)} GEN</span>
        <span className="text-red-400">No: {formatGen(noWeight)} GEN</span>
      </div>
      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden flex">
        {total > 0 ? (
          <>
            <div 
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${yesPercent}%` }}
            ></div>
            <div 
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${noPercent}%` }}
            ></div>
          </>
        ) : (
          <div className="h-full w-full bg-zinc-800"></div>
        )}
      </div>
    </div>
  );
}
