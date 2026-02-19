export default function PriceDisplay({ price = 0, change = 0, label }) {
  const cents = Math.round(price * 100);
  const isUp = change > 0;
  const isDown = change < 0;
  const arrow = isUp ? '▲' : isDown ? '▼' : '';
  const changeColor = isUp ? 'text-[#00ff88]' : isDown ? 'text-[#ff3366]' : 'text-white/40';

  return (
    <div className="font-mono">
      {label && <div className="text-[9px] tracking-widest text-white/30 mb-0.5">{label}</div>}
      <div className="flex items-baseline gap-1.5">
        <span className="text-white text-lg font-bold">{cents}¢</span>
        {change !== 0 && (
          <span className={`text-[10px] ${changeColor}`}>
            {arrow} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
