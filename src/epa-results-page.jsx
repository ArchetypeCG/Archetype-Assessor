import React, { useState, useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { latestEpaOutcomes } from "../server/epa-metrics.mjs";
import { fmt } from "./lib";
export function EpaResultsPage({ context }) {
  const { s, user, pageFilter, openLearner, go } = context;
  const [result, setResult] = useState(pageFilter.result || "");
  useEffect(() => setResult(pageFilter.result || ""), [pageFilter]);
  if (user.role !== "Manager")
    return (
      <p>EPA provision results are available to the master administrator.</p>
    );
  const records = latestEpaOutcomes(s.epaOutcomes || [])
    .filter((row) => !result || row.result === result)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="workload-panel" aria-label="EPA results detail">
      <div className="workload-heading">
        <div>
          <h2>
            {result || "All"} EPA results <span>{records.length}</span>
          </h2>
          <p>
            Latest recorded result per apprentice · completed and archived
            records included
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => go("Command centre")}
        >
          Back to dashboard
        </button>
      </div>
      <label className="epa-grade-filter">
        Result{" "}
        <select
          aria-label="EPA result filter"
          value={result}
          onChange={(e) => setResult(e.target.value)}
        >
          <option value="">All results</option>
          {["Distinction", "Pass", "Fail"].map((grade) => (
            <option key={grade}>{grade}</option>
          ))}
        </select>
      </label>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Apprentice",
                "Programme",
                "Assessor",
                "EPA result",
                "Result date",
                "Record",
              ].map((title) => (
                <th key={title}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row) => {
              const learner = s.learners.find((l) => l.id === row.learnerId);
              return (
                <tr key={row.id}>
                  <td>
                    <strong>
                      {learner?.name ||
                        row.learnerName ||
                        "Archived apprentice"}
                    </strong>
                  </td>
                  <td>
                    {row.standardName ||
                      s.standards.find((st) => st.id === row.standardId)
                        ?.name ||
                      "Previous programme"}
                  </td>
                  <td>
                    {s.users.find((u) => u.id === row.assessorId)?.name ||
                      "Previous assessor"}
                  </td>
                  <td>
                    <span
                      className={"epa-result-label " + row.result.toLowerCase()}
                    >
                      {row.result}
                    </span>
                  </td>
                  <td>{fmt(row.date)}</td>
                  <td>
                    {learner ? (
                      <button
                        className="text-link"
                        onClick={() => openLearner(learner.id, "Gateway")}
                      >
                        Open apprentice <ArrowUpRight size={14} />
                      </button>
                    ) : (
                      <span className="caption">Archived record</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!records.length && (
        <p className="workload-empty">
          No recorded {result.toLowerCase()} EPA results.
        </p>
      )}
    </section>
  );
}
