// these types cannot live in a "use server" module: re-exporting an imported
// type there compiles and builds, then dies at the first click.

export type SignInState = {
  error: string | null;
  // the address is echoed back, the password never: it would land in the HTML.
  email: string;
};

export const INITIAL_SIGNIN_STATE: SignInState = {
  error: null,
  email: "",
};

export type SignupFormState = {
  error: string | null;
  /** keyed by field name (`email`, `password`). */
  fields: Record<string, string>;
  email: string;
  displayName: string;
};

export const INITIAL_SIGNUP_STATE: SignupFormState = {
  error: null,
  fields: {},
  email: "",
  displayName: "",
};
