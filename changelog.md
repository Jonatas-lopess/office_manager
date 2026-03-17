# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-03-17

### Added

- **Numeric Timestamps**: Support for numeric timestamps across all tables (`clients`, `services`, `logs`).

### Changed

- **Database Schema**: Refactored `created_at` and `updated_at` fields to use integer timestamps for better compatibility across environments.
- **Boot Sequence**: Enhanced application initialization logic in `main.tsx` for more robust Hub discovery and loading states.
- **Form Validation**: Updated date field handling in Client and Service forms to use native `Date` objects, resolving synchronization and display issues.
- **Logger**: Updated internal logger to support new timestamp format.

### Fixed

- Resolved multiple TypeScript errors related to `Date | undefined` handling in service forms.
- Improved network scan safety when running outside of Tauri.
- **Danger Zone**: Updated feature in settings to fix a ui bug.
