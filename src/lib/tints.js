// Lantern chip tints: light text on a ~14% tint of the same color (the `chip` utility).

export const MOOD_TINTS = {
  tired: "#FCD34D",
  homesick: "#C4B5FD",
  hopeful: "#6EE7B7",
  calm: "#5EEAD4",
  grateful: "#FDA4AF",
  lonely: "#93C5FD",
  happy: "#FDE68A",
  nervous: "#FCA5A5",
};

export const CONTEXT_TINTS = {
  weather: "#7DD3FC",
  time: "#A5B4FC",
  moment: "#FDBA74",
};

// Inline style for a tinted chip: <span className="chip" style={tint(MOOD_TINTS.tired)}>
export const tint = (color) => ({ "--chip": color });
