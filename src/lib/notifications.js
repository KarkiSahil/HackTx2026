// What a notification says and where tapping it goes.
export function describeNotification({ type, payload = {} }) {
  const from = payload.from_name ?? "Someone";
  const place = payload.place_name ?? "a place";
  switch (type) {
    case "comment":
      return { text: `${from} commented on your story at ${place}`, href: `/story/${payload.story_id}` };
    case "chain_reply":
      return { text: `The next letter after yours was written at ${place}`, href: `/place/${payload.place_id}` };
    case "dm_request":
      return { text: `${from} wants to message you`, href: "/messages" };
    case "dm_message":
      return { text: `New message from ${from}`, href: `/messages/${payload.thread_id}` };
    default:
      return { text: "Something new on Katha", href: "/" };
  }
}

export function browserAlertsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}
