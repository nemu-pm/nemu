# nemu-navigation-title-menu

iOS-only local Expo module: a hidden view that attaches a UIKit title menu
(`UINavigationItem.titleMenuProvider`, iOS 16+) to the react-native-screens
screen it is mounted in. UIKit draws the system chevron next to the
navigation title and opens the menu from the title — the iOS Files folder
menu pattern. Optional `header` maps to `UINavigationItem.documentProperties`.

react-native-screens 4.28 / expo-router 58 expose no title menu (header items
and `Stack.Toolbar.Menu` only), and `RNSScreenStackHeaderConfig` never writes
`titleMenuProvider`, so setting it from the owning `RNSScreen` survives header
updates. Android uses a Compose dropdown in the header title instead
(`src/components/MobileLibraryTitleMenu.android.tsx`).
