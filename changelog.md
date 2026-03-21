# Changelog

All notable changes to this project will be documented in this file.

## [2.5.0] - 2026-03-21

### Added

- **Eleição de Master (Topologia)**: Implementado sistema de eleição de Hub para evitar múltiplos Hubs na mesma rede. O app agora busca hubs existentes e apenas se promove a Hub se nenhum for encontrado após múltiplas tentativas.
- **Recuperação de Porta (Windows)**: O servidor Hub agora tenta religar-se à porta 1234 em intervalos se ela estiver ocupada (comum em reinicializações rápidas no Windows).

### Fixed

- **Connection Storm**: Implementada trava de segurança (`isConnecting`) no frontend para evitar a criação de múltiplas conexões WebSocket simultâneas que causavam instabilidade e alto consumo de recursos.
- **Failover de Rede**: Scanner de Hub aprimorado com timeout de 1500ms e detecção de falha de interface de rede (IP local indisponível) para maior resiliência em ambientes instáveis.

## [2.4.4] - 2026-03-20

### Fixed

- **Motor de Sincronização**: Refatorada a lógica de ponte de sincronização para suportar failover automático entre Hubs e detecção mais precisa de conclusão de sincronismo inicial.
- **Confiabilidade de Backup**: Implementada nova abordagem de backup utilizando serialização direta do banco de dados para garantir maior integridade dos dados ao salvar em rede.

## [2.4.3] - 2026-03-20

### Added

- **Limpeza de Logs**: Novo botão na "Zona de Perigo" das configurações para remover todos os registros de auditoria com confirmação simples.

### Fixed

- **Race Condition (Database)**: Resolvida falha onde a lista de logs não atualizava automaticamente após ações de criação, edição ou exclusão.

## [2.4.2] - 2026-03-20

### Added

- **Entrada Monetária**: Implementada máscara de entrada em tempo real para valores monetários em campos de preço.

### Fixed

- **Logs em Tempo Real**: Resolvida falha onde a lista de logs não atualizava automaticamente após ações de criação, edição ou exclusão.
- **Conflito de Escuta (Database)**: Implementado o `DBChangeHub` (Multiplexer) para permitir múltiplos ouvintes simultâneos no banco de dados, evitando que a página de logs interrompesse a sincronização de rede.
- **Estabilidade de Sincronização**: Corrigida regressão de performance que causava a interrupção do motor de sincronização ao navegar pelo aplicativo.

## [2.4.1] - 2026-03-20

### Added

- **Garbage Collector**: Implementado botão de limpeza no cabeçalho de serviços para remover pagamentos órfãos silenciosamente via ORM.

### Changed

- **Entrada Monetária**: Substituídas as máscaras rígidas por campos de texto de digitação livre (com vírgula para centavos) e normalização automática ao sair do campo.
- **Limpeza de UI**: Removido o selo de "Prototype" do cabeçalho global para uma interface mais limpa.

### Fixed

- **Integridade de Dados**: Implementada exclusão em cascata (nível de aplicação) para garantir que pagamentos sejam removidos quando um serviço é excluído.

## [2.4.0] - 2026-03-19

### Changed

- **Otimização de Performance**: Reestruturação dos formulários de serviços para reduzir re-renderizações e melhorar a velocidade.
- **Limpeza de UI**: Removidas informações de bloqueio desnecessárias nos diálogos financeiros e de serviço.

### Fixed

- **Correção de Layout**: Resolvido falhas na exibição do dashboard e das configurações quando o conteúdo está bloqueado.

## [2.3.0] - 2026-03-19

### Added

- **Bloqueio Total do Dashboard**: Implementado bloqueio completo da interface do Dashboard quando não autenticado, aumentando a privacidade.
- **Proteção da Zona de Perigo**: Adicionado cadeado de segurança na "Zona de Perigo" das configurações, evitando exclusões acidentais de dados.
- **Liquidação Rápida**: Novo botão "Adicionar Pagamento" em diálogos financeiros para serviços à vista, permitindo quitar o saldo restante com um único clique.

### Fixed

- **Compatibilidade de Ambiente**: Corrigido o carregamento da senha do dashboard através do `.env` renomeando a variável para `VITE_DASHBOARD_PASSWORD` (padrão Vite).
- **Consistência de Bloqueio**: Ajustado o comportamento de bloqueio para ser reativo e persistente entre as páginas principais.

## [2.2.0] - 2026-03-19

### Added

- **Segurança (Security)**: Implementado sistema de proteção por senha para visualização de dados financeiros (valores monetários e faturamento).
- **Proteção nas Páginas**: O bloqueio de dados sensíveis foi estendido tanto para o Dashboard quanto para a página de Serviços.
- **Backup Manual**: Adicionado botão na aba "Dados" para realizar backup imediato do banco de dados.
- **Pasta de Backups**: Nova funcionalidade para abrir diretamente a pasta onde os backups são armazenados.
- **Integração de Pagamento**: Adicionada a opção de registrar o primeiro pagamento no momento da criação de um novo serviço.

### Changed

- **Refatoração de Componentes**: A página de serviços foi refatorada, separando modais e linhas de resumo em componentes menores (`SummaryRow`, `ServiceDialog`, `FinancialDialog`) para melhor organização.
- **Otimização de Busca**: Implementado _debounce_ global nos campos de busca para melhorar a performance e responsividade da interface.
- **Melhorias no Diálogo de Serviço**: Fluxo de criação de serviço atualizado para garantir visibilidade dos campos de pagamento e consistência de dados.

### Fixed

- **Tipagem do Schema**: Corrigido erro de tipo no campo `has_serious_illness` que estava impedindo operações de salvamento em clientes.
- **Permissões de Arquivo**: Ajustadas permissões de capacidades do Tauri para permitir que o app verifique e crie diretórios de backup corretamente.
- **Configuração de Ambiente**: Correção em nomes de variáveis no arquivo `.env` para garantir a carga correta de configurações.

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
