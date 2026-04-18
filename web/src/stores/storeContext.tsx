import { createContext, useContext, type ReactNode } from "react";
import { AppStore } from "./AppStore";

const StoreContext = createContext<AppStore | null>(null);

export function StoreProvider({
  store,
  children,
}: {
  store: AppStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): AppStore {
  const store = useContext(StoreContext);
  if (store === null) {
    throw new Error("useStore must be used within <StoreProvider>");
  }
  return store;
}
