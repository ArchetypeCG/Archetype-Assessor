import React from "react";
import { Trophy } from "lucide-react";
import { epaPerformance } from "../server/epa-metrics.mjs";
export function EpaPerformance({ performance, overall = false, onResult }) {
  const GradeCard = onResult ? "button" : "div";
  const stats = performance || epaPerformance([], ""),
    distinction = stats.distinction.percentage,
    pass = stats.pass.percentage;
  const background = stats.total
    ? `conic-gradient(#ffda8c 0 ${distinction}%, #68e2c5 ${distinction}% ${distinction + pass}%, #ff9da9 ${distinction + pass}% 100%)`
    : "#ffffff20";
  const title = overall
    ? "Overall EPA results"
    : "Your EPA performance as an assessor";
  return (
    <section className="assessor-epa-performance" aria-label={title}>
      <div className="epa-performance-heading">
        <span>
          <Trophy size={18} />
          {title}
        </span>
        <small>
          {overall
            ? "All apprentices’ recorded EPA results · all time"
            : "Your apprentices’ recorded EPA results · all time"}
        </small>
      </div>
      <div className="epa-performance-layout">
        <div
          className="epa-performance-donut"
          style={{ background }}
          aria-hidden="true"
        >
          <div>
            <strong>{stats.total}</strong>
            <span>EPA results</span>
          </div>
        </div>
        <div className="epa-performance-grades">
          {[
            ["distinction", "Distinction"],
            ["pass", "Pass"],
            ["fail", "Fail"],
          ].map(([key, label]) => (
            <GradeCard
              className={
                "epa-grade " + key + (onResult ? " actionable-epa-grade" : "")
              }
              key={key}
              type={onResult ? "button" : undefined}
              onClick={onResult ? () => onResult(label) : undefined}
              aria-label={
                onResult
                  ? `View ${label} EPA results: ${stats[key].count} apprentices`
                  : undefined
              }
            >
              <span className="epa-grade-label">
                <i />
                {label}
              </span>
              <strong>{stats[key].percentage}%</strong>
              <small>
                {stats[key].count} apprentice{stats[key].count === 1 ? "" : "s"}
              </small>
            </GradeCard>
          ))}
        </div>
      </div>
      <p>
        {stats.total
          ? overall
            ? "Overall results across all assessors, based on apprentices with a recorded EPA result. Each apprentice is counted once using their latest result. Completed and archived apprentices remain included."
            : "Your performance is based on your apprentices with recorded EPA results. Percentages show the share awarded each grade. Completed and archived apprentices remain included."
          : overall
            ? "Record confirmed EPA results in Edit apprentice to see overall performance across your provision."
            : "Record your apprentices’ EPA results in Edit apprentice to see your performance as an assessor."}
      </p>
    </section>
  );
}
