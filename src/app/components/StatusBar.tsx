import { useState, useEffect } from "react";
import { Radio, Battery, Signal } from "lucide-react";

export function StatusBar({ nodeCount }: { nodeCount: number }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs font-mono text-[#7B9CC4]">
      <span>{hh}:{mm}</span>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[#22C55E]">
          <Radio size={11} />
          MESH·{nodeCount}
        </span>
        <Battery size={13} />
        <Signal size={13} />
      </div>
    </div>
  );
}
