import { makeAutoObservable } from "mobx";
import { AetherDataStore } from "./AetherDataStore";
import { CompareStore } from "./CompareStore";
import { DataStore } from "./DataStore";
import { FavoritesStore } from "./FavoritesStore";
import { SecretStore } from "./SecretStore";
import { ThemeStore } from "./ThemeStore";

export type View =
  | "lookup"
  | "explore"
  | "compare"
  | "visualize"
  | "compose"
  | "gallery"
  | "about";

/**
 * Root store. Owns child stores and global app state (current view).
 * Composed once in `StoreProvider`.
 */
export class AppStore {
  readonly data: DataStore;
  readonly aetherData: AetherDataStore;
  readonly theme: ThemeStore;
  readonly favorites: FavoritesStore;
  readonly compare: CompareStore;
  readonly secret: SecretStore;
  view: View = "lookup";

  constructor() {
    this.data = new DataStore();
    this.aetherData = new AetherDataStore();
    this.theme = new ThemeStore();
    this.favorites = new FavoritesStore();
    this.compare = new CompareStore();
    this.secret = new SecretStore();
    makeAutoObservable(this, {
      data: false,
      aetherData: false,
      theme: false,
      favorites: false,
      compare: false,
      secret: false,
    });
  }

  setView(view: View): void {
    this.view = view;
  }
}
