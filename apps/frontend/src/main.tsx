import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./premium.css";
import "./motion.css";
import { MotionSystem } from "./motion";
import App from "./App";
createRoot(document.getElementById("root")!).render(
  <MotionSystem>
    <App />
  </MotionSystem>,
);
