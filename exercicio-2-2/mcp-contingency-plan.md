# Plano de Contingência — Indisponibilidade de MCP Servers

**Projeto:** db1/novatech-assistant
**Referência:** extraído da Seção 7 do documento "Arquitetura de MCP Servers — NovaTech Assistant"

**Princípio guia:** agente degradado é melhor que agente quebrado. O objetivo destes planos não é restaurar o server (isso é responsabilidade do fornecedor ou do time de infra), e sim **manter o dev produtivo** enquanto o server está fora.

## 1. GitHub MCP

1. **Impacto**: Copilot e Claude Code perdem a capacidade de ler/buscar código via agente e Claude Code não consegue abrir PR automaticamente. O código local no editor continua acessível normalmente — o que quebra é a camada de integração do agente com o GitHub, não o Git em si.
2. **Modo degradado**: Sim, é o cenário mais fácil de degradar. Claude Code continua editando, gerando e explicando código localmente sem qualquer perda de qualidade — só perde a leitura remota de outros arquivos/branches via API e a criação automática de PR.
3. **Ação imediata (5 min)**: verificar `https://www.githubstatus.com`. Se for outage do GitHub, seguir direto para o fallback. Se for específico da nossa integração (token expirado, etc.), tentar reautenticar o MCP uma vez.
4. **Fallback**: usar `git` e `gh` CLI diretamente no terminal, ou a interface web do GitHub, para tudo que seria feito via MCP (ler branch, abrir PR, checar status).
5. **Critério de escalação**: se o outage for do GitHub (status page confirma) — nenhuma escalação interna, é só esperar. Se for problema de configuração da nossa integração (token/permissão) e persistir por **mais de 30 minutos**, escalar para o Tech Lead.

## 2. Azure AI Search MCP

1. **Impacto**: o agente perde a capacidade de consultar o índice `novatech-kb` para testar/validar retrieval. Prototipagem de prompts que dependem de contexto recuperado do índice fica sem grounding real.
2. **Modo degradado**: Sim. Dev continua codando features que não dependem de consulta ao índice no momento (ex.: lógica de negócio, testes unitários, UI). O que fica bloqueado é especificamente a validação de qualidade de retrieval.
3. **Ação imediata (5 min)**: checar `Azure Status` (status.azure.com) para a região do serviço; verificar no Azure Portal se o índice está healthy e se não é throttling por limite de query (causa comum).
4. **Fallback**: usar o **Search Explorer** do próprio Azure Portal, ou uma chamada REST direta (`curl`/Postman) com a query key, para validar manualmente o que seria testado via MCP.
5. **Critério de escalação**: se for throttling/outage temporário, resolver sozinho com o fallback. Escalar para o Tech Lead imediatamente se o índice retornar **resultados incorretos ou vazios mesmo estando "healthy"** — isso pode indicar problema de dados, não de disponibilidade, e é mais grave do que uma indisponibilidade simples.

## 3. Azure OpenAI MCP

1. **Impacto**: o agente não consegue testar `chat_completion`/`embeddings` do deployment `gpt-4o-novatech`. Isso bloqueia especificamente a prototipagem e validação de prompts/comportamento do assistente — não afeta o uso do Claude Code ou Copilot em si, que são serviços separados.
2. **Modo degradado**: Parcial. O dev continua trabalhando no código da aplicação (parsers, integrações, UI), mas qualquer tarefa que exija "rodar o modelo de verdade" para validar comportamento fica bloqueada até haver fallback.
3. **Ação imediata (5 min)**: no Azure Portal, checar quota/rate limit do deployment (causa mais comum de erro 429) e o health do recurso. Rate limit estourado é resolvível sozinho (aguardar reset ou revisar uso concorrente do time).
4. **Fallback**: testar o deployment diretamente pelo **Azure AI Studio Playground**, ou via chamada REST direta com a mesma chave, fora do fluxo do MCP.
5. **Critério de escalação**: se for rate limit, tentar resolver sozinho primeiro. Escalar para o Tech Lead imediatamente se for **erro de configuração do deployment** (ex.: deployment removido, quota zerada) ou se o outage persistir por **mais de 15 minutos** — esse server tem menor tolerância a downtime porque bloqueia validação funcional do produto, não só conveniência do dev.

## 4. Confluence NovaTech MCP

1. **Impacto**: o agente perde a capacidade de buscar/ler páginas de documentação de negócio automaticamente. Nenhum código ou fluxo de desenvolvimento é afetado diretamente — é puramente uma perda de conveniência de consulta.
2. **Modo degradado**: Sim, quase sem perda. Esse é o server menos crítico do inventário — tudo que ele oferece pode ser obtido manualmente sem custo relevante de tempo.
3. **Ação imediata (5 min)**: abrir o Confluence direto no navegador e localizar a página manualmente.
4. **Fallback**: copiar o conteúdo relevante da página e colar direto na conversa com o agente, se o conteúdo precisar entrar no contexto do Claude/Claude Code.
5. **Critério de escalação**: baixa prioridade. Só escalar (para o Tech Lead, informalmente) se a indisponibilidade persistir por **mais de 1 dia** — não justifica escalação para o time da NovaTech nesse prazo.

## 5. Azure DevOps MCP

1. **Impacto**: o agente não consegue ler ou criar/atualizar work items automaticamente. Afeta principalmente Product Specialist e DM, que usam Claude para consultar/gerenciar itens; devs são pouco afetados no dia a dia de código.
2. **Modo degradado**: Sim. O trabalho de desenvolvimento continua normalmente; o que degrada é a visibilidade/atualização de status via agente — que volta a ser manual.
3. **Ação imediata (5 min)**: abrir o board do Azure DevOps direto no navegador; se havia uma ação pendente (criar/atualizar item), anotar para fazer manualmente e não perder o registro.
4. **Fallback**: criar/atualizar work items manualmente pela interface web do Azure DevOps, exatamente como era feito antes da integração via MCP.
5. **Critério de escalação**: escalar para o **Delivery Manager** se a indisponibilidade coincidir com **fechamento de sprint ou reporte de status ao cliente** (janela onde a visibilidade dos work items é crítica); fora dessa janela, tratar como baixa prioridade e resolver com o fallback.

## 6. Tabela Resumo

| Server | Criticidade | Fallback disponível? | Impacto no dev |
|---|---|---|---|
| GitHub | Alta | Sim (git/gh CLI, GitHub web) | Médio — contorna-se rápido, mas é usado o tempo todo |
| Azure AI Search | Média | Sim (Azure Portal Search Explorer, REST) | Médio — bloqueia só a etapa de validação de retrieval |
| Azure OpenAI | Alta | Sim (Azure AI Studio Playground, REST) | Alto — bloqueia validação funcional do comportamento do assistente |
| Confluence NovaTech | Baixa | Sim (acesso via browser) | Baixo — perda de conveniência, sem bloqueio real |
| Azure DevOps | Média | Sim (interface web do Azure DevOps) | Baixo–Médio — mais sensível a timing (fechamento de sprint) do que a frequência de uso |
