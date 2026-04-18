import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { AppStore } from "../stores/AppStore";
import { StoreProvider, useStore } from "../stores/storeContext";
import { PageShell } from "../ui/PageShell";
import { LookupView } from "../features/lookup/LookupView";
import { ExploreView } from "../features/explore/ExploreView";
import { CompareView } from "../features/compare/CompareView";
import { VisualizeView } from "../features/visualize/VisualizeView";
import { ComposeView } from "../features/compose/ComposeView";
import { GalleryView } from "../features/gallery/GalleryView";
import { AboutView } from "../features/about/AboutView";

const ViewSwitch = observer(function ViewSwitch() {
  const { view } = useStore();
  switch (view) {
    case "lookup":    return <LookupView />;
    case "explore":   return <ExploreView />;
    case "compare":   return <CompareView />;
    case "visualize": return <VisualizeView />;
    case "compose":   return <ComposeView />;
    case "gallery":   return <GalleryView />;
    case "about":     return <AboutView />;
  }
});

const Bootstrap = observer(function Bootstrap() {
  const store = useStore();

  useEffect(() => {
    void store.data.loadIndex();
  }, [store]);

  // Konami listener — global, single-attach, cleaned up on unmount.
  useEffect(() => store.secret.attach(), [store]);

  // Mirror Æther-mode state onto `<html data-aether="1">` so the CSS
  // overlay block in `globals.css` can layer Æther treatments on top of
  // any active theme. Read inside the effect so the observer dep is
  // explicit; ThemeStore uses the same pattern for `data-theme`.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (store.secret.aetherActive) {
      document.documentElement.setAttribute("data-aether", "1");
    } else {
      document.documentElement.removeAttribute("data-aether");
    }
  }, [store.secret.aetherActive]);

  return (
    <PageShell>
      <ViewSwitch />
    </PageShell>
  );
});

export function App() {
  const store = useMemo(() => {
    const next = new AppStore();
    // Permalink routing: a `#plan=…` hash unambiguously belongs to the
    // Compose feature (#17), so dropping a shared link into a fresh
    // browser should land on Compose with the results already on screen.
    // Done here, before the view tree mounts, so there's no flash of
    // the default Lookup page.
    if (typeof window !== "undefined" && /(^|&)plan=/.test(window.location.hash)) {
      next.setView("compose");
    }
    return next;
  }, []);
  return (
    <StoreProvider store={store}>
      <Bootstrap />
    </StoreProvider>
  );
}
