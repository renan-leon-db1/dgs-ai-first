# ADR-0003: Tratamento de Documentos Contraditórios

## Status: Proposto

## Contexto

O problema central desta ADR não é de modelo — é de dados. A análise técnica identificou contradições em ao menos 3 procedimentos na base documental da NovaTech. A causa raiz é estrutural: 3 áreas diferentes (Operações, Compliance, Comercial) atualizam documentação mensalmente sem processo unificado de revisão ou controle de versão.

Este é um problema de **qualidade e governança de dados**, e a solução arquitetural deve refletir isso — não tentar esconder a inconsistência atrás da capacidade do LLM de "escolher" a resposta correta.

As três opções avaliadas são:

1. **Manter apenas o documento mais recente** por data de modificação
2. **Manter ambas as versões com metadado de vigência** e surfacear as duas ao usuário com indicação de data e área responsável
3. **Delegar a decisão ao LLM** via instrução no prompt ("prefira documentos mais recentes em caso de contradição")

A exigência do Product Specialist é explícita: _"Documentos contraditórios devem mostrar ambas as versões com indicação de data."_

## Decisão

**Manter ambas as versões na base vetorial com metadados explícitos de vigência, área responsável e status de conflito flagado**, e instruir o pipeline a surfacear ambas ao atendente com contexto suficiente para que o atendente tome a decisão — não o sistema.

Implementação concreta:

1. **No processo de ingestão:** ao indexar um documento, verificar se existe outro documento com mesmo `procedure_id` ou título normalizado e versão diferente. Se sim, ambos recebem o metadado `conflict_status: flagged` e são linkados entre si via `conflict_pair_id`

2. **No pipeline de retrieval:** quando chunks de documentos conflitantes são recuperados para a mesma query, o contexto enviado ao LLM inclui ambos com separadores explícitos:

   ```
   [DOCUMENTO A — Operações — v2.1 — Jan/2025 — STATUS: CONFLITO IDENTIFICADO]
   <chunk>
   [DOCUMENTO B — Compliance — v3.0 — Mar/2025 — STATUS: CONFLITO IDENTIFICADO]
   <chunk>
   ```

3. **No system prompt:** instrução explícita de que em caso de conflito o modelo deve apresentar ambas as versões ao atendente com suas respectivas datas e áreas, e finalizar com: _"Recomendo verificar com [área responsável pelo documento mais recente] antes de informar o cliente."_

4. **No dashboard de governança** (entregável secundário): listar todos os `conflict_pair_id` ativos com data do primeiro conflito detectado — insumo para que as áreas responsáveis resolvam a inconsistência na fonte.

5. A apresentação de versões conflitantes será determinada por regra determinística na camada de orquestração, não apenas por instrução de prompt. O LLM receberá payload estruturado validado e não poderá omitir campos obrigatórios de conflito.

## Consequências

**Positivas:**
- Transparência total: o atendente sabe que há contradição e qual é a fonte mais recente
- O sistema não toma decisões de negócio que cabem aos humanos (qual versão da política está ativa)
- O dashboard de conflitos cria pressão institucional para que as áreas resolvam as inconsistências na fonte — ataca a causa raiz, não apenas o sintoma
- Compliance: em uma auditoria, é possível demonstrar que o sistema não suprimiu nenhuma versão de documento

**Negativas:**
- Respostas com conflito são mais longas e potencialmente confusas para o atendente
- Requer lógica adicional no pipeline de ingestão para detecção de conflitos (matching por `procedure_id`, título normalizado, embeddings similares)
- Se não houver resolução dos conflitos na fonte, o dashboard acumula itens e perde valor ao longo do tempo
- O atendente ainda precisa "perguntar para quem sabe" nos casos de conflito — redução parcial do problema original
- Risco adicional: aumento de ambiguidade operacional no front de atendimento. Mitigação: playbook de decisão, treinamento e validações automáticas de resposta.

## Alternativas Consideradas

**Manter apenas o documento mais recente:**
- Simples e produz respostas sem ambiguidade
- Descartado porque "mais recente" não é necessariamente "correto" — uma área pode ter revertido uma política por razão válida e o documento mais antigo pode ser o vigente. Além disso, silenciosamente descarta informação que pode ser relevante, violando o requisito do Product Specialist

**Delegar ao LLM (instrução de preferência por data):**
- Zero overhead de implementação
- Descartado por razão fundamental: o LLM não tem acesso ao contexto de negócio para saber qual versão está operacionalmente ativa. Isso seria o LLM tomando uma decisão de negócio com informação incompleta — exatamente o cenário de alucinação indireta (o modelo não inventa fatos, mas arbitra entre fatos reais de forma incorreta). Inaceitável em contexto de atendimento ao cliente com implicações contratuais


## Critérios de Produção

Só entra em produção se atender: p95 de latência <= X s; custo médio por atendimento <= Y; cobertura de citação >= 99%; precisão de detecção de conflito >= Z%; atualização documental em <= 24h comprovada por monitoramento.

## Governança e Operação

Cada conflito terá owner, SLA de resolução e escalonamento automático. O painel de conflitos deixa de ser secundário e passa a ser controle operacional com metas e alertas.

## Auditoria e Compliance

Registrar trilha completa por atendimento: documentos/chunks recuperados, versões, timestamps, decisão do atendente, justificativa, e hash da resposta. Definir retenção, acesso e descarte conforme política corporativa e requisitos regulatórios.

