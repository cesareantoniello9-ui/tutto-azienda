import { ArrowUpRight } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

type RevenueChartProps = {
  title?: string;
  total: string;
  deltaPct: number;
  data: number[];
  labels: string[];
};

function buildPaths(data: number[]) {
  const n = data.length;
  if (n < 2) return { line: "", area: "" };
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (n - 1)) * 100;
    const y = 100 - ((v - min) / range) * 88 - 6; // padding sopra/sotto
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L 100 100 L 0 100 Z`;
  return { line, area };
}

export function RevenueChart({
  title = "Ricavi",
  total,
  deltaPct,
  data,
  labels,
}: RevenueChartProps) {
  const { line, area } = buildPaths(data);
  const up = deltaPct >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {total}
          </span>
          <span
            className={
              "inline-flex items-center gap-0.5 text-xs font-medium " +
              (up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
            }
          >
            <ArrowUpRight className="size-3" />
            {Math.abs(deltaPct)}% vs periodo precedente
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-48 w-full overflow-visible"
          role="img"
          aria-label="Andamento ricavi"
        >
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#revFill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
