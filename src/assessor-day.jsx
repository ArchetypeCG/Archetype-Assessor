import React from "react";
import {
  Sun,
  CalendarDays,
  ArrowUpRight,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import { assessorDay } from "./assessor-day.mjs";
import { fmt } from "./lib";
export function AssessorDay({ s, user, go, openLearner, setModal }) {
  const day = assessorDay(s, user.id);
  const session = day.nextSession;
  const learner = session && s.learners.find((l) => l.id === session.learnerId);
  return (
    <aside className="assessor-day" aria-label="Your day at a glance">
      <div className="assessor-day-heading">
        <span>
          <Sun size={17} /> Your day at a glance
        </span>
        <time dateTime={day.day}>
          {new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            timeZone: "Europe/London",
          }).format(new Date(day.day + "T12:00:00Z"))}
        </time>
      </div>
      <section className="assessor-day-section">
        <h3>
          <CalendarDays size={14} /> Next session
        </h3>
        {session ? (
          <button
            className="assessor-day-session"
            aria-label={`Open session: ${session.title} with ${learner.name}`}
            onClick={() =>
              setModal({ type: "sessionDetail", item: session, learner })
            }
          >
            <span>
              <strong>{session.title}</strong>
              <span>{learner.name}</span>
              <small>
                {session.date === day.day ? "Today" : fmt(session.date)} ·{" "}
                {session.allDay
                  ? "All day"
                  : !session.time
                    ? "Time to be confirmed"
                    : `${session.time}${session.endTime ? "–" + session.endTime : ""}`}{" "}
                · UK time
              </small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        ) : (
          <div className="assessor-day-empty">
            No upcoming sessions.{" "}
            <button onClick={() => go("Calendar")}>
              Open calendar <ArrowUpRight size={13} />
            </button>
          </div>
        )}
      </section>
      <section className="assessor-day-section">
        <h3>
          <ClipboardCheck size={14} /> Today’s priorities
        </h3>
        <div className="assessor-day-priorities">
          <button onClick={() => go("Reviews Hub")}>
            <span>
              <b className={day.overdueReviews ? "day-urgent" : ""}>
                {day.overdueReviews}
              </b>{" "}
              overdue reviews
              {day.reviewsToday > 0 && (
                <small> · {day.reviewsToday} due today</small>
              )}
            </span>
            <ArrowUpRight size={14} />
          </button>
          <button onClick={() => go("Portfolios")}>
            <span>
              <b>{day.evidence}</b> awaiting feedback
            </span>
            <ArrowUpRight size={14} />
          </button>
          <button onClick={() => go("Off-the-job learning")}>
            <span>
              <b>{day.logs}</b> OTJ logs to verify
            </span>
            <ArrowUpRight size={14} />
          </button>
        </div>
      </section>
      <section className="assessor-day-section">
        <h3>
          <GraduationCap size={15} /> Approaching gateway & EPA{" "}
          <small>Next 60 days</small>
        </h3>
        {day.upcoming.length ? (
          <>
            <div className="assessor-day-gateway">
              {day.upcoming.slice(0, 2).map(({ learner, date, label }) => (
                <button
                  key={learner.id}
                  onClick={() => openLearner(learner.id, "Gateway")}
                >
                  <span>
                    <strong>{learner.name}</strong>
                    <small>
                      {label} · {fmt(date)}
                    </small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            {day.upcoming.length > 2 && (
              <button
                className="assessor-day-more"
                onClick={() => go("Gateway & EPA")}
              >
                View all {day.upcoming.length} apprentices{" "}
                <ArrowUpRight size={13} />
              </button>
            )}
          </>
        ) : (
          <div className="assessor-day-empty">
            No dates approaching in the next 60 days.{" "}
            <button onClick={() => go("Gateway & EPA")}>
              View gateway checklist <ArrowUpRight size={13} />
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}
