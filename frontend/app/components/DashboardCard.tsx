type DashboardCardProps = {
  title: string;
  value: string;
  growth: string;
};

export default function DashboardCard({
  title,
  value,
  growth,
}: DashboardCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-blue-500 transition-all duration-300">
      
      <h3 className="text-sm text-zinc-400">
        {title}
      </h3>

      <div className="mt-4 flex items-end justify-between">
        
        <h1 className="text-3xl font-bold text-white">
          {value}
        </h1>

        <span className="text-green-500 text-sm font-medium">
          {growth}
        </span>
      </div>
    </div>
  );
}