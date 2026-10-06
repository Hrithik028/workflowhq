import { lazy, type ComponentProps } from "react";
import RouteContentBoundary from "./RouteContentBoundary";

const TaskModal = lazy(() => import("./TaskModal"));
const AiPlanModal = lazy(() => import("./AiPlanModal"));

export function DeferredTaskModal(props: ComponentProps<typeof TaskModal>) {
  return (
    <RouteContentBoundary message="Opening the ticket editor">
      <TaskModal {...props} />
    </RouteContentBoundary>
  );
}

export function DeferredAiPlanModal(props: ComponentProps<typeof AiPlanModal>) {
  return (
    <RouteContentBoundary message="Opening AI planning">
      <AiPlanModal {...props} />
    </RouteContentBoundary>
  );
}
