Dock.tsx and Dock.css are vendored from React Bits:
https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/Dock

Local additions: optional controlled `revealed` state and `ariaLabel`, plus item
`value`/`disabled` properties for language selection and accessible pressed state.
The original component's animation, layout and spring calculations are preserved.
Dock.css and language-switcher.css are imported from app/globals.css so the
Tailwind Turbopack loader processes both through a single global CSS entry point.
See LICENSE.md for the upstream license. Flags in public/flags come from
https://github.com/lipis/flag-icons (MIT; license included alongside the flags).
