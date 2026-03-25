# Privacy Policy — Dusty Tab Notes

**Last updated:** March 25, 2026

## Overview

Dusty Tab Notes is a Chrome extension that provides a sidebar notepad for Chrome tab groups. This privacy policy explains how the extension handles your data.

## Data Collection

**Dusty Tab Notes does not collect, transmit, or share any data.**

## Data Storage

All notes and preferences are stored locally on your device using Chrome's built-in `chrome.storage.local` API. This data:

- Never leaves your device
- Is not sent to any server
- Is not accessible to the extension developer or any third party
- Is automatically removed if you uninstall the extension

## Permissions

The extension requests the following Chrome permissions:

| Permission | Why it's needed |
|------------|----------------|
| `sidePanel` | To display the notepad in Chrome's side panel |
| `tabGroups` | To detect which tab group is active and label notes accordingly |
| `storage` | To save your notes locally on your device |
| `activeTab` | To determine which tab is currently active |
| `tabs` | To detect tab changes and group membership |

## Third-Party Services

Dusty Tab Notes does not use any third-party services, analytics, or tracking of any kind.

## Changes to This Policy

If this privacy policy changes, the updated version will be published alongside the extension update. The "Last updated" date at the top will reflect the most recent revision.

## Contact

If you have questions about this privacy policy, please open an issue on the project's GitHub repository.
