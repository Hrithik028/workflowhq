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
        {categories.length === 0 ? <p className="empty-copy">No open work in this scope.</p> : null}
        {categories.map((category) => (
          <div
            className="bar-chart-h-row"
            key={category.key}
            onBlur={() => setHovered((current) => (current === category.key ? null : current))}
            onFocus={() => setHovered(category.key)}
            onMouseEnter={() => setHovered(category.key)}
            onMouseLeave={() =>
              setHovered((current) => (current === category.key ? null : current))
            }
            tabIndex={0}
          >
            <span>{category.label}</span>
            <i className="bar-chart-h-track">
              <b
                style={{ background: category.color, width: `${(category.value / max) * 100}%` }}
              />
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
  const points = data.map((entry, index) => ({
    x: 32 + (index / Math.max(1, data.length - 1)) * 536,
    y: 162 - (entry.count / max) * 128
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className="analytics-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {caption ? <p>{caption}</p> : null}
      </header>
      <div className="delivery-trend">
        {data.length ? (
          <svg
            viewBox="0 0 600 190"
            role="img"
            aria-label={`${title}: ${data.reduce((sum, day) => sum + day.count, 0)} completed issues by last-updated date`}
          >
            {[0, 0.5, 1].map((ratio) => (
              <g key={ratio}>
                <line
                  x1="32"
                  x2="568"
                  y1={162 - ratio * 128}
                  y2={162 - ratio * 128}
                  stroke="currentColor"
                  opacity="0.12"
                />
                <text x="2" y={166 - ratio * 128} fontSize="11">
                  {Math.round(max * ratio)}
                </text>
              </g>
            ))}
            <polygon points={`32,162 ${line} ${points.at(-1)!.x},162`} fill={color} opacity="0.1" />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {data.map((entry, index) => (
              <circle
                key={entry.date}
                cx={points[index].x}
                cy={points[index].y}
                r={hovered === index ? 6 : 4}
                fill={color}
                stroke="white"
                strokeWidth="2"
                tabIndex={0}
                aria-label={`${formatDate(entry.date)}: ${entry.count} issues`}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>
                  {formatDate(entry.date)}: {entry.count} issues
                </title>
              </circle>
            ))}
            <text x="32" y="186" fontSize="11">
              {formatDate(data[0].date)}
            </text>
            <text x="568" y="186" fontSize="11" textAnchor="end">
              {formatDate(data.at(-1)!.date)}
            </text>
          </svg>
        ) : (
          <p className="empty-copy">No completion data recorded.</p>
        )}
        {hovered !== null && data[hovered] ? (
          <p role="status">
            {formatDate(data[hovered].date)} · {data[hovered].count} issues
          </p>
        ) : null}
        <details>
          <summary>View daily counts</summary>
          <table>
            <caption>Completed issues by last-updated date</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry) => (
                <tr key={entry.date}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}
