import { useNavigate, useParams } from "react-router-dom";
import { useLiveLocation } from "../lib/useLiveLocation";
import AppShell from "../components/AppShell";
import StoryPanel from "../components/StoryPanel";

// Direct link to one story (from notifications); the same view a board opens in a panel.
export default function StoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location } = useLiveLocation();
  return (
    <AppShell back title="Story">
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 md:px-6 md:pt-8">
        <StoryPanel storyId={id} location={location} onBlocked={() => navigate("/", { replace: true })} />
      </div>
    </AppShell>
  );
}
