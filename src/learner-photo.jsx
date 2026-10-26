import React, { useEffect, useState } from "react";
import { initials } from "./lib";
import { sessionLink } from "./session";
import samplePortrait from "./assets/fictional-apprentice.png";
import { fictionalPortraitKey } from "../server/profile-photo.mjs";
import taylorPortrait from "./assets/fictional-taylor.png";
import morganPortrait from "./assets/fictional-morgan.png";
import caseyPortrait from "./assets/fictional-casey.png";
import jordanPortrait from "./assets/fictional-jordan.png";
import rileyPortrait from "./assets/fictional-riley.png";
const portraits = {
  alex: samplePortrait,
  taylor: taylorPortrait,
  morgan: morganPortrait,
  casey: caseyPortrait,
  jordan: jordanPortrait,
  riley: rileyPortrait,
};
const sample = (learner) => portraits[fictionalPortraitKey(learner)] || "";
export function LearnerAvatar({ learner, large = false }) {
  const [failed, F] = useState(false);
  const source = learner.photo
    ? sessionLink(
        `/api/learners/${learner.id}/photo?v=${encodeURIComponent(learner.photo.id)}`,
      )
    : sample(learner);
  useEffect(() => F(false), [source]);
  return (
    <span className={"avatar learner-avatar" + (large ? " large" : "")}>
      {source && !failed ? (
        <img
          src={source}
          loading="lazy"
          decoding="async"
          alt={`${learner.name} profile`}
          onError={() => F(true)}
        />
      ) : (
        initials(learner.name)
      )}
    </span>
  );
}
async function preparePhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw Error("Choose an image up to 5 MB.");
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height)
      throw Error("This image could not be opened.");
    const canvas = document.createElement("canvas");
    const side = Math.min(image.width, image.height);
    canvas.width = canvas.height = Math.min(side, 768);
    canvas
      .getContext("2d")
      .drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    return { base64: canvas.toDataURL("image/jpeg", 0.88).split(",")[1] };
  } finally {
    image.close();
  }
}
export function LearnerPhotoEditor({ learner, user, command, busy }) {
  const [file, FILE] = useState(null),
    [preview, PREVIEW] = useState(""),
    [error, ERROR] = useState(""),
    [pending, PENDING] = useState(false);
  useEffect(() => {
    if (!file) {
      PREVIEW("");
      return;
    }
    const url = URL.createObjectURL(file);
    PREVIEW(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!["Manager", "Assessor", "Apprentice"].includes(user.role)) return null;
  async function save(remove = false) {
    ERROR("");
    PENDING(true);
    try {
      await command("learner.photo", {
        learnerId: learner.id,
        ...(remove ? { remove: true } : { file: await preparePhoto(file) }),
      });
      FILE(null);
    } catch (error) {
      ERROR(error.message || "Could not save this photo.");
    } finally {
      PENDING(false);
    }
  }
  return (
    <section
      className="profile-photo-editor"
      aria-label="Apprentice profile photo"
    >
      <div>
        <strong>Apprentice profile photo</strong>
        <p>JPG, PNG or WebP · up to 5 MB · centred square crop</p>
      </div>
      <label className="photo-upload">
        Choose profile photo
        <input
          aria-label="Choose apprentice profile photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending || busy}
          onChange={(e) => {
            FILE(e.target.files?.[0] || null);
            ERROR("");
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <img
          className="photo-preview"
          src={preview}
          alt="New profile photo preview"
        />
      )}
      {file && (
        <>
          <button
            className="button"
            disabled={pending || busy}
            onClick={() => save()}
          >
            Save profile photo
          </button>
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => FILE(null)}
          >
            Cancel photo
          </button>
        </>
      )}
      {(learner.photo || sample(learner)) && (
        <button
          className="button secondary"
          disabled={pending || busy}
          onClick={() => save(true)}
        >
          Remove profile photo
        </button>
      )}
      {sample(learner) && !learner.photo && (
        <p className="caption">
          AI-generated portrait for this fictional apprentice.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
