// Warm initials backgrounds, picked by name so each person keeps theirs.
const GRADIENTS = [
  "linear-gradient(135deg, #FCD34D, #EA580C)",
  "linear-gradient(135deg, #FDA4AF, #E11D48)",
  "linear-gradient(135deg, #6EE7B7, #0F766E)",
  "linear-gradient(135deg, #C4B5FD, #6D28D9)",
  "linear-gradient(135deg, #7DD3FC, #0369A1)",
  "linear-gradient(135deg, #FDBA74, #C2410C)",
];

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-10 w-10 text-sm",
  header: "h-11 w-11 text-base",
  lg: "h-16 w-16 text-2xl",
  xl: "h-[124px] w-[124px] text-5xl",
};

export default function Avatar({ name = "", size = "md", className = "", anonymous = false }) {
  if (anonymous) {
    return (
      <div
        className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full border border-dashed border-fg-3 font-display text-fg-2 ${className}`}
        aria-hidden="true"
      >
        ?
      </div>
    );
  }
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hash = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);

  return (
    <div
      className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-on-lamp ${className}`}
      style={{ background: GRADIENTS[hash % GRADIENTS.length] }}
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}
