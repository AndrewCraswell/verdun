/** A page the menu opens beside its list: the war map, the options, the controls, the credits. */
export interface MenuPage {
  readonly id: string
  /** The page's heading, and its entry in the menu's list. */
  readonly title: string
  readonly root: HTMLElement
  /** Called each time the page is shown, to bring what it shows up to date. */
  opened?(): void
  /** Called each time it's put away. */
  closed?(): void
  /** A key pressed while the page is open, before the menu acts on it; true when the page used it. */
  key?(event: KeyboardEvent): boolean
  /** Called about once a second while the page is shown. */
  tick?(): void
  dispose?(): void
}
