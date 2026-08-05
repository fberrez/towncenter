// no "use client" here: app/layout.tsx is a server component and must read
// THEME_SCRIPT as a string, not as a client reference proxy.

export const THEME_STORAGE_KEY = "towncenter-theme";

export type Theme = "dark" | "light";

export const DEFAULT_THEME: Theme = "light";

// runs in <head> before paint, so a stored dark theme never flashes light.
export const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}
}catch(e){}})();`;
