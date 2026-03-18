# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-03-18

### Added

- **Gestão Financeira**: Nova tabela `payments` para abstrair e robustecer o controle de pagamentos por serviço.
- **Múltiplos Pagamentos**: Agora é possível registrar diversos pagamentos (Pix, Cartão, Dinheiro, etc.) para um único serviço através do novo diálogo "Financeiro".
- **Novas Métricas no Dashboard**:
    - **Receita**: Total real recebido baseado nos pagamentos registrados.
    - **A Receber**: Cálculo automático do saldo pendente de todos os serviços.
    - **Gráfico de Renda**: Visualização temporal da receita recebida através dos pagamentos.

### Changed

- **Dashboard Refatorado**: UI atualizada com novos cards de estatísticas, filtros de período e visualização aprimorada de serviços recentes.
- **Formulário de Serviços**: Campos de UI refatorados para incluir métodos de pagamento (À Vista/Parcelado) e melhor integração com o módulo financeiro.
- **Máscaras de Moeda**: Implementação de máscaras de entrada em tempo real para valores monetários em campos de preço.

### Fixed

- **Sincronização de Datas**: Correção na lógica de tratamento de objetos `Date` nos formulários, garantindo consistência entre o banco e a UI.
- **Estabilidade do Dashboard**: Ajustes nas queries para evitar falhas de carregamento em estados iniciais.

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
