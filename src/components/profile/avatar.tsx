/**
 * Default profile avatar: the gender Shiba. Files live in
 * public/avatars (shiba_male.png = deal-with-it Doge, shiba_female.png
 * = bow Doge). Unknown/absent genders fall back to the male Doge so no
 * profile ever renders faceless.
 */
"use client";

import { useState } from "react";

export function avatarForGender(gender: string | null): string {
  return gender === "female"
    ? "/avatars/shiba_female.png"
    : "/avatars/shiba_male.png";
}

export function Avatar({
  gender,
  size = 64,
  alt = "profile photo",
}: {
  gender: string | null;
  size?: number;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-label={alt}
        role="img"
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-app/70 text-lg font-bold text-content"
      >
        {(alt || "?").trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarForGender(gender)}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
