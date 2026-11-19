/**
 * Default profile avatar: the gender Shiba. Files live in
 * public/avatars (shiba_male.png = deal-with-it Doge, shiba_female.png
 * = bow Doge). Unknown/absent genders fall back to the male Doge so no
 * profile ever renders faceless.
 */
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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarForGender(gender)}
      alt={alt}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
