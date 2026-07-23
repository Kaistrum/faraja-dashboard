import { Html, Head, Main, NextScript } from "next/document";

// Runs before hydration so the page never flashes the wrong theme. Must stay
// in sync with @kaistrum/stratum-ui's ThemeProvider (localStorage key
// "design-system-theme", plain "dark"/"light" string, `.light` class on
// <html>) — the app itself defaults to light, unlike Stratum's dark-first
// default, so an absent/invalid key resolves to "light" here.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("design-system-theme");
    var theme = stored === "dark" || stored === "light" ? stored : "light";
    document.documentElement.classList.toggle("light", theme === "light");
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
