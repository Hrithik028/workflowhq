import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { requestActivity } from "../api/requestActivity";
import { LoadingExperience } from "./LoadingExperience";
import PublicGlow from "./PublicGlow";

export default function LoadingTimingPreview() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Ready. Fast changes should not show a loader.");
  const waits = useRef(new Set<{ timer: number; finish: () => void }>());
  useEffect(() => {
    const pending = waits.current;
    return () => {
      pending.forEach(({ timer, finish }) => {
        window.clearTimeout(timer);
        finish();
      });
      pending.clear();
    };
  }, []);
  const simulate = (delay: number) => {
    navigate(delay < 1000 ? "/tasks" : "/projects");
    setMessage(`Simulated ${delay < 1000 ? "fast" : "slow"} tab change pending.`);
    const wait = { finish: () => {}, timer: 0 };
    // Start after the new page establishes its navigation scope.
    wait.timer = window.setTimeout(() => {
      wait.finish = requestActivity.begin();
      wait.timer = window.setTimeout(() => {
        wait.finish();
        waits.current.delete(wait);
        if (waits.current.size === 0) setMessage("Tab change complete. Loader hidden.");
      }, delay);
    }, 0);
    waits.current.add(wait);
  };
  const complete = () => {
    waits.current.forEach(({ timer, finish }) => {
      window.clearTimeout(timer);
      finish();
    });
    waits.current.clear();
    setMessage("Tab change complete. Loader hidden.");
  };
  return (
    <>
      <PublicGlow className="auth-ribbon" />
      <main className="product-main">
        <h1>Loading timing preview</h1>
        <p>Local simulation only. The loader appears after three seconds. No API calls or saved changes.</p>
        <button className="button" onClick={() => simulate(250)}>
          Fast tab change (250ms)
        </button>
        <button className="button" onClick={() => simulate(8000)}>
          Slow tab change (8 seconds)
        </button>
        <button className="button" onClick={complete}>
          Finish loading now
        </button>
        <p>{message}</p>
      </main>
      <LoadingExperience />
    </>
  );
}
