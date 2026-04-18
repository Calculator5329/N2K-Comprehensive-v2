import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/storeContext";
import { THEMES, type LayoutId } from "../core/themes";
import { SidebarLayout }     from "./layouts/SidebarLayout";
import { TopbarLayout }      from "./layouts/TopbarLayout";
import { ManuscriptLayout }  from "./layouts/ManuscriptLayout";
import { BlueprintLayout }   from "./layouts/BlueprintLayout";
import { FrameLayout }       from "./layouts/FrameLayout";
import { ReceiptLayout }     from "./layouts/ReceiptLayout";
import { BoardLayout }       from "./layouts/BoardLayout";
import { PlatformLayout }    from "./layouts/PlatformLayout";
import { SpreadsheetLayout } from "./layouts/SpreadsheetLayout";
import { ScrapbookLayout }   from "./layouts/ScrapbookLayout";
import { PanelsLayout }      from "./layouts/PanelsLayout";
import { ChartLayout }       from "./layouts/ChartLayout";

/**
 * The root page chrome. Picks between layout variants based on the active
 * theme's `layout` field. Each layout owns its own page composition —
 * masthead position, navigation style, content surface, footer.
 *
 * Adding a new layout: implement a component in `ui/layouts/`, extend
 * `LayoutId` in `core/themes.ts`, then add a case below.
 */
/** Mapping from `LayoutId` → page-shell component. */
const LAYOUTS: Record<LayoutId, React.ComponentType<{ children: ReactNode }>> = {
  sidebar:     SidebarLayout,
  topbar:      TopbarLayout,
  manuscript:  ManuscriptLayout,
  blueprint:   BlueprintLayout,
  frame:       FrameLayout,
  receipt:     ReceiptLayout,
  board:       BoardLayout,
  platform:    PlatformLayout,
  spreadsheet: SpreadsheetLayout,
  scrapbook:   ScrapbookLayout,
  panels:      PanelsLayout,
  chart:       ChartLayout,
};

export const PageShell = observer(function PageShell({ children }: { children: ReactNode }) {
  const { theme } = useStore();
  const Layout = LAYOUTS[THEMES[theme.theme].layout] ?? SidebarLayout;
  return <Layout>{children}</Layout>;
});
