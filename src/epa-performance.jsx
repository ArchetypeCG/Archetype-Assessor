import React from "react";
import { Trophy } from "lucide-react";
import { epaPerformance } from "../server/epa-metrics.mjs";
export function EpaPerformance({ performance }) {
  const stats = performance || epaPerformance([], ""),
    distinction = stats.distinction.percentage,
    pass = stats.pass.percentage;
  const background = stats.total
    ? `conic-gradient(#ffda8c 0 ${distinction}%, #68e2c5 ${distinction}% ${distinction + pass}%, #ff9da9 ${distinction + pass}% 100%)`
    : "#ffffff20";
  return (
    <section
      className="assessor-epa-performance"
      aria-label="Your EPA performance as an assessor"
    >
      <div className="epa-performance-heading">
        <span>
          <Trophy size={18} />
          Your EPA performance as an assessor
        </span>
        <small>Your apprentices’ recorded EPA results · all time</small>
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
            <div className={"epa-grade " + key} key={key}>
              <span className="epa-grade-label">
                <i />
                {label}
              </span>
              <strong>{stats[key].percentage}%</strong>
              <small>
                {stats[key].count} apprentice{stats[key].count === 1 ? "" : "s"}
              </small>
            </div>
          ))}
        </div>
      </div>
      <p>
        {stats.total
          ? "Your performance is based on your apprentices with recorded EPA results. Percentages show the share awarded each grade. Completed and archived apprentices remain included."
          : "Record your apprentices’ EPA results in Edit apprentice to see your performance as an assessor."}
      </p>
    </section>
  );
}
