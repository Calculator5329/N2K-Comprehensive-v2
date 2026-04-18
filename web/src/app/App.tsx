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

  return (
    <PageShell>
      <ViewSwitch />
    </PageShell>
  );
});

export function App() {
  const store = useMemo(() => new AppStore(), []);
  return (
    <StoreProvider store={store}>
      <Bootstrap />
    </StoreProvider>
  );
}
