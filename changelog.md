# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - 2026-03-17

### Fixed

- **Importação CSV**: Corrigida a lógica de preenchimento de zeros (padding) em CPFs e CNPJs para adicionar à esquerda, garantindo a integridade dos dados exportados pelo Excel.
- **Normalização de Dados**: Adicionada extração de apenas dígitos durante a importação para evitar falhas de validação por formatação.
- **Atualizador Interno**: Corrigida a falha na abertura do instalador MSI via permissões de "opener" do Tauri.
- **Logs de Depuração**: Adicionado rastreamento de caminho do instalador no console para diagnosticar problemas de rede.

### Changed

- **Logs de Auditoria**: Refatorado o registro de logs de importação para garantir que todas as tentativas sejam registradas, incluindo falhas e registros duplicados.
- **Feedback Visual**: Melhoradas as mensagens de notificação (Toasts) após a importação de CSV para refletir com mais precisão o resultado da operação.

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
