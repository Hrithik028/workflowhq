import { useTheme } from "../theme-context";
import RibbonGlow from "./RibbonGlow";

export default function PublicGlow({ className, hover = 0, size = 100 }: { className: string; hover?: number; size?: number }) {
  const { theme } = useTheme();

  return (
    <div className={className} aria-hidden="true">
      <RibbonGlow
        background={theme === "dark" ? "#101922" : "#F5F2EC"}
        color1={theme === "dark" ? "#84B6B9" : "#2FD3F2"}
        color2={theme === "dark" ? "#A59BB1" : "#7B61FF"}
        speed={22}
        size={size}
        hover={hover}
        reach={210}
        style={{ minWidth: 0, minHeight: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
