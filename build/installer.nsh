; Custom NSIS additions for the Monstera PDF Editor installer.
; Adds a welcome page for a universal full installer — greets a first-time user
; and notes that an existing install is updated in place. electron-builder inserts
; this macro (if defined) as the assisted-installer welcome page; ${VERSION} and
; ${PRODUCT_NAME} are provided by electron-builder.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ${PRODUCT_NAME}"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install ${PRODUCT_NAME} version ${VERSION} on your computer.$\r$\n$\r$\nIf an earlier version is already installed, it will be updated in place and your documents and settings are kept.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
