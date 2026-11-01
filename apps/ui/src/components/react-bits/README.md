Dock.tsx and Dock.css are vendored from React Bits:
https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/Dock

Local additions: optional controlled `revealed` state and `ariaLabel`, plus item
`value`/`disabled` properties for language selection and accessible pressed state.
The original component's animation, layout and spring calculations are preserved.
Dock.css and language-switcher.css are imported from app/globals.css so the
Tailwind Turbopack loader processes both through a single global CSS entry point.
See LICENSE.md for the upstream license. Flags in public/flags come from
https://github.com/lipis/flag-icons (MIT; license included alongside the flags).

FuzzyText.tsx is installed from the React Bits FuzzyText-TS-TW registry:
https://reactbits.dev/text-animations/fuzzy-text
It displays the responsive animated 404 on the centered not-found screen.
The upstream component includes reduced-motion support and animation cleanup.
See LICENSE.md for the upstream license.

SoftAurora.tsx is vendored from React Bits:
https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Backgrounds/SoftAurora
Local adaptations: settings refs update in an effect for React compatibility,
and layout styles are inline so canvas sizing does not depend on CSS loading.
SiteHeader uses a centered 160px
effect layer clipped to the header, with pointer events disabled on the backdrop.

WebThreads.tsx is vendored from React Bits:
https://github.com/DavidHDev/react-bits/tree/main/src/ts-tailwind/Backgrounds/WebThreads
Local adaptations: settings refs update in an effect for React compatibility,
and an optional registerStop callback integrates WebGL cleanup with the protected
application's media lifecycle. ApplicationBackground supplies the configured
effect in a full-width layer between the header and footer.
