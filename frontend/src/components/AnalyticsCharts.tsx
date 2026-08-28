import { useState } from "react";

import type { DailyCompletion } from "../types";
import { formatDate } from "../utils/format";

interface Category {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface CategoryBarChartProps {
  caption?: string;
  categories: Category[];
  title: string;
}

export function CategoryBarChart({ caption, categories, title }: CategoryBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...categories.map((category) => category.value));

  return (
    <section className="analytics-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {caption ? <p>{caption}</p> : null}
      </header>
      <div className="chart-legend">
        {categories.map((category) => (
          <span key={category.key}>
            <i style={{ background: category.color }} />
            {category.label}
          </span>
        ))}
      </div>
      <div className="bar-chart-h">
        {categories.map((category) => (
          <div
            className="bar-chart-h-row"
            key={category.key}
            onBlur={() => setHovered((current) => (current === category.key ? null : current))}
            onFocus={() => setHovered(category.key)}
            onMouseEnter={() => setHovered(category.key)}
            onMouseLeave={() => setHovered((current) => (current === category.key ? null : current))}
            tabIndex={0}
          >
            <span>{category.label}</span>
            <i className="bar-chart-h-track">
              <b style={{ background: category.color, width: `${(category.value / max) * 100}%` }} />
            </i>
            <b className="bar-chart-h-value">{category.value}</b>
            {hovered === category.key ? (
              <div className="chart-tooltip" role="tooltip">
                <strong>{category.value}</strong> {category.label}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

interface TrendBarChartProps {
  caption?: string;
  color: string;
  data: DailyCompletion[];
  title: string;
}

export function TrendBarChart({ caption, color, data, title }: TrendBarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((entry) => entry.count));

  return (
    <section className="analytics-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {caption ? <p>{caption}</p> : null}
      </header>
      <div className="bar-chart-v">
        {data.map((entry, index) => {
          const showLabel = index === 0 || index === data.length - 1 || index % 3 === 0;
          return (
            <div
              className="bar-chart-v-col"
              key={entry.date}
              onBlur={() => setHovered((current) => (current === index ? null : current))}
              onFocus={() => setHovered(index)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered((current) => (current === index ? null : current))}
              tabIndex={0}
            >
              {hovered === index ? (
                <div className="chart-tooltip" role="tooltip">
                  <strong>{entry.count}</strong> {formatDate(entry.date)}
                </div>
              ) : null}
              <i className="bar-chart-v-track">
                <b style={{ background: color, height: `${(entry.count / max) * 100}%` }} />
              </i>
              <span>{showLabel ? formatDate(entry.date) : ""}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
