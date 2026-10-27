import React from "react";
import { FileText, Download, Trash2, ShieldCheck } from "lucide-react";
import { sessionLink } from "./session";
import { localDate, fmt } from "./lib";
export function LearnerSupportFields({ record = {} }) {
  return (
    <>
      <div className="confidential-callout wide">
        <ShieldCheck size={19} />
        <span>
          Personal and support details are visible only to the master admin and
          assigned assessor.
        </span>
      </div>
      <label className="wide">
        Home address
        <textarea
          name="address"
          rows={3}
          maxLength={2000}
          defaultValue={record.address || ""}
          autoComplete="street-address"
        />
      </label>
      <label>
        Date of birth
        <input
          type="date"
          name="dateOfBirth"
          max={localDate()}
          defaultValue={record.dateOfBirth || ""}
        />
      </label>
      <label>
        Telephone number
        <input
          type="tel"
          name="telephone"
          maxLength={80}
          autoComplete="tel"
          defaultValue={record.telephone || ""}
        />
      </label>
      <h3 className="wide personal-details-subheading">Emergency contact</h3>
      <label>
        Emergency contact name
        <input
          name="emergencyContactName"
          maxLength={160}
          defaultValue={record.emergencyContactName || ""}
        />
      </label>
      <label>
        Relationship to apprentice
        <input
          name="emergencyContactRelationship"
          maxLength={100}
          defaultValue={record.emergencyContactRelationship || ""}
        />
      </label>
      <label>
        Emergency contact telephone
        <input
          type="tel"
          name="emergencyContactTelephone"
          maxLength={80}
          defaultValue={record.emergencyContactTelephone || ""}
        />
      </label>
      <label>
        Emergency contact alternative telephone
        <input
          type="tel"
          name="emergencyContactAlternativeTelephone"
          maxLength={80}
          defaultValue={record.emergencyContactAlternativeTelephone || ""}
        />
      </label>
      <label className="wide">
        Emergency contact email (optional)
        <input
          type="email"
          name="emergencyContactEmail"
          maxLength={254}
          defaultValue={record.emergencyContactEmail || ""}
        />
      </label>
      <h3 className="wide personal-details-subheading">
        Additional learning support
      </h3>
      <label>
        Additional learning support status
        <select
          name="alsStatus"
          defaultValue={record.alsStatus || "Not recorded"}
        >
          {[
            "Not recorded",
            "Assessment pending",
            "No additional support",
            "Support in place",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="wide">
        Additional learning support record
        <textarea
          name="alsDetails"
          rows={5}
          maxLength={20000}
          defaultValue={record.alsDetails || ""}
          placeholder="Record assessed needs, agreed support, relevant history and who provides support."
        />
      </label>
      <label className="wide">
        Reasonable adjustments and support plan
        <textarea
          name="reasonableAdjustments"
          rows={4}
          maxLength={20000}
          defaultValue={record.reasonableAdjustments || ""}
          placeholder="Record the practical adjustments, support arrangements and review actions."
        />
      </label>
      <label>
        Support review date
        <input
          type="date"
          name="supportReviewDate"
          defaultValue={record.supportReviewDate || ""}
        />
      </label>
    </>
  );
}
export function LearnerDocuments({
  record = {},
  learnerId,
  command,
  busy,
  onError,
}) {
  return (
    <>
      <div className="confidential-callout wide">
        <ShieldCheck size={19} />
        <span>
          Certificates, ALS diagnoses and medical documents are stored
          privately. Only the master admin and assigned assessor can download
          them.
        </span>
      </div>
      <label>
        Document category
        <select name="documentCategory">
          {[
            "Certificate",
            "ALS assessment or diagnosis",
            "Medical information",
            "Other",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="wide document-dropzone">
        Upload supporting documents
        <input
          type="file"
          name="supportFiles"
          multiple
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
        />
        <span>
          Choose up to 5 files, maximum 5 MB each. Files are uploaded when you
          save the apprentice.
        </span>
      </label>
      <div className="wide learner-document-list">
        {(record.documents || []).map((doc) => (
          <article key={doc.id}>
            <FileText size={23} />
            <div>
              <strong>{doc.name}</strong>
              <small>
                {doc.category} · {Math.ceil(doc.size / 1024)} KB ·{" "}
                {fmt(doc.created)}
              </small>
            </div>
            <a
              className="icon-button"
              aria-label={`Download ${doc.name}`}
              href={sessionLink("/api/learner-documents/" + doc.id)}
            >
              <Download size={17} />
            </a>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${doc.name}`}
              disabled={busy}
              onClick={async () => {
                try {
                  await command("learner.document.remove", {
                    learnerId,
                    id: doc.id,
                  });
                } catch (error) {
                  onError(error.message);
                }
              }}
            >
              <Trash2 size={17} />
            </button>
          </article>
        ))}
        {!record.documents?.length && (
          <p className="caption">No supporting documents uploaded yet.</p>
        )}
      </div>
    </>
  );
}
