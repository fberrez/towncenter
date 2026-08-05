// this type cannot live in a "use server" module: re-exporting an imported type
// there compiles and builds, then dies at the first click.

export type PriceGridState = {
  error: string | null;
  /** keyed by PriceGrid's own ASCII key, which is also the input `name`. */
  fields: Record<string, string>;
  saved: boolean;
};

export const INITIAL_PRICE_GRID_STATE: PriceGridState = {
  error: null,
  fields: {},
  saved: false,
};
