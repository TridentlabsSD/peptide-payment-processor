/* ============================================================
   3PSolutions Dashboard — configuration
   ------------------------------------------------------------
   Paste your deployed Google Apps Script Web App URL below to
   make the dashboard read live data from your Google Sheet.

   Leave it empty ("") and the dashboard shows built-in sample
   data instead (useful for local design work).

   See SHEETS_SETUP.md for step-by-step deployment instructions.
   ============================================================ */

const CONFIG = {
  // e.g. "https://script.google.com/macros/s/AKfy.../exec"
  SHEET_API_URL: "",

  // How often to re-fetch from the Sheet, in seconds (0 = never).
  REFRESH_SECONDS: 0,
};
