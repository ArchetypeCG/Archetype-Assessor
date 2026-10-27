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
    <section className="assessor-epa-performance" aria-label="EPA performance">
      <div className="epa-performance-heading">
        <span>
          <Trophy size={18} />
          EPA performance
        </span>
        <small>Recorded learner results · all time</small>
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
                {stats[key].count} learner{stats[key].count === 1 ? "" : "s"}
              </small>
            </div>
          ))}
        </div>
      </div>
      <p>
        {stats.total
          ? "Percentages use learners with a recorded EPA result. Completed and archived learners remain included."
          : "Record an EPA result in Edit apprentice to start building your performance picture."}
      </p>
    </section>
  );
}
