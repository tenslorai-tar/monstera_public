; Custom NSIS additions for the Monstera PDF Editor installer.
; Adds a welcome page that makes clear this setup UPDATES an existing install.
; electron-builder inserts this macro (if defined) as the assisted-installer
; welcome page; ${VERSION} and ${PRODUCT_NAME} are provided by electron-builder.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} — Update"
  !define MUI_WELCOMEPAGE_TEXT "This wizard updates your installation of ${PRODUCT_NAME} to version ${VERSION}.$\r$\n$\r$\nIf an earlier version is installed it will be replaced in place; your saved documents and settings are kept.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
