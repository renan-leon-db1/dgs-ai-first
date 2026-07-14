## Harness do NovaTech Assistant — 5 Camadas

### 1. Tool Orchestration (ingestão → retrieval → geração)

| O QUE JÁ EXISTE | O QUE FALTA | COMO FECHAR O GAP |
|---|---|---|
| Pipeline de ingestão processa 847 docs → Azure AI Search | Sem detecção de conflito na ingestão (ADR-0003 exige `conflict_status` e `conflict_pair_id`, mas não há indicação de que isso está implementado) | Criar `src/pipeline/conflict-detector.ts`: ao indexar, faz match por `procedure_id` normalizado + similaridade de embedding do título; se match, seta `conflict_status: flagged` e `conflict_pair_id` em ambos os docs no índice |
| Query endpoint (Azure Function HTTP) recebe pergunta, busca chunks, retorna resposta | Não há etapa de "classificação de intenção multi-domínio" (ADR-0002 exige) antes do retrieval | Adicionar `src/services/intent-classifier.ts` chamado no início do `PromptBuilder`; heurística de keywords (SLA, frete, devolução, compliance) decide se dispara busca paralela por categoria |
| `SearchService` faz busca vetorial + Semantic Ranker | Falta orquestração explícita de "busca paralela por categoria" quando multi-domínio é detectado | Função `retrieveMultiDomain(query, categories)` em `search.ts` que dispara `Promise.all` de buscas 2-3 chunks/categoria e monta o payload com separadores `[FONTE: ...]` |
| `CompletionService` chama Azure OpenAI GPT-4o | Não há etapa de pós-processamento que valide a saída do LLM contra o schema antes de retornar ao Teams/Web | Implementar `src/services/response-validator.ts` (já existe no repo como stub vazio) entre `CompletionService` e a resposta HTTP — parseia com `QueryResponseSchema` (Zod) antes de devolver ao cliente |
| Fluxo documentado em AGENTS.md (function → prompt-builder → search → completion) | O fluxo real não tem um "orchestrator" único testável — cada etapa é chamada implicitamente na function HTTP | Extrair um `src/services/orchestrator.ts` com função `handleQuery(payload): Promise<QueryResponse>` que encadeia validação → classificação → retrieval → prompt-build → completion → validação de saída, testável isoladamente |

---

### 2. Verification Loops (fonte válida? schema respeitado? claim vs. chunk?)

| O QUE JÁ EXISTE | O QUE FALTA | COMO FECHAR O GAP |
|---|---|---|
| `schemas/query.ts` define `{ answer, source_document, confidence }` | Nada garante em runtime que `source_document` aponta para um documento real recuperado (LLM pode alucinar uma fonte) | Função `validateSourceExists(response, retrievedChunks)` em `src/services/response-validator.ts`: rejeita (lança `SourceMismatchError`) se `source_document` não estiver na lista de `chunk.source` recuperados nesta query |
| GPT-4o retorna texto livre citando fonte | Sem verificação claim-vs-chunk (o texto da resposta pode não estar de fato suportado pelo chunk citado) | Adicionar segunda chamada leve (ou heurística de overlap lexical/embedding) que checa se `answer` tem sobreposição semântica mínima com o `source_document.content`; se abaixo de limiar, marca `verificationFailed: true` e força revisão humana |
| Zod já é regra do AGENTS.md para toda entrada/saída externa | Zod não está sendo aplicado à **saída** do LLM antes de retornar (só a entrada HTTP é validada, segundo o gap relatado) | `QueryResponseSchema.parse(llmOutput)` obrigatório em `completion.ts`; se `parse` falhar (ex: falta `source_document`), lançar `LlmCompletionError` e cair no fallback humano — nunca retornar payload não validado |
| 75% de cobertura de testes de integração | Não há testes cobrindo especificamente os 12% de falhas descobertas (alucinação, doc desatualizado, chunk errado) | Criar `tests/integration/verification-loops.test.ts` com fixtures reproduzindo os 3 cenários de falha e asserando que o `response-validator` os bloqueia antes de chegar ao atendente |
| Detecção de conflito prevista na ADR-0003 | Verificação de que **ambos** os campos de conflito (área + vigência) estão presentes quando `conflict_status: flagged` | Zod schema `ConflictResponseSchema` com campos obrigatórios `documentA`, `documentB`, cada um com `owner` e `validFrom` — se schema falhar, resposta é bloqueada e cai em human-in-the-loop |

---

### 3. Context & Memory (conectado à ADR-0002)

| O QUE JÁ EXISTE | O QUE FALTA | COMO FECHAR O GAP |
|---|---|---|
| ADR-0002 define orçamento de ~9.000 tokens/turno e regra de truncamento top-8/top-4, já implementado em `retrieveChunks()` no AGENTS.md | Não há **verificação em runtime** de que o orçamento total (system + chunks + histórico + query + buffer) não estoura os ~9k antes de enviar ao GPT-4o | Função `enforceTokenBudget(promptParts): void` em `prompt-builder.ts` que soma tokens reais (via tiktoken) de cada bloco e lança `ContextBudgetExceededError` se ultrapassar 9.000 — usada como guard antes de chamar `CompletionService` |
| `buildHistory(turns)` já implementa janela deslizante de 3 trocas sem sumarização (AGENTS.md 2.3) | Nenhuma métrica/log confirma que a janela de 3 está de fato sendo respeitada em produção (risco de regressão silenciosa em PR futuro) | Log estruturado obrigatório em cada chamada: `logger.info({ historyTurnsUsed: turns.length }, 'context assembled')` — se `historyTurnsUsed > 3`, alerta automático (ver camada 5) |
| Regra de truncamento top-8 → top-4 se score do 5º < 0.60, já codificada | Falta rastrear, por query, **quantos chunks foram efetivamente truncados**, para alimentar o dashboard de qualidade (ex: queries truncadas podem ter taxa de erro maior) | Adicionar campo `chunksTruncated: boolean` e `chunksReturned: number` ao log de cada query — não requer nova estratégia de contexto, só instrumentação da regra já decidida |
| ADR-0002 já rejeitou sumarização de histórico como estratégia | — (não fechar gap aqui: é decisão fechada) | Manter guard de teste: `tests/unit/prompt-builder.test.ts` deve conter um teste que falha explicitamente se qualquer função introduzir `summarizeOlderTurns` — trava a decisão da ADR contra regressão do Copilot |
| ADR-0002 define multi-domínio via busca paralela por categoria | Falta decidir como o orçamento de "4.000 tokens de chunks" se divide quando há busca paralela por 2-4 categorias simultâneas (ADR não especifica) | **Não inventar nova estratégia** — usar a mesma regra top-8: dividir os 8 chunks proporcionalmente entre categorias detectadas (ex: 2 categorias → 4+4; 4 categorias → 2 cada), mantendo o total de chunks e portanto o orçamento de 4.000 tokens inalterado |

---

### 4. Guardrails

**(a) Determinísticos — structured output + código**

| O QUE JÁ EXISTE | O QUE FALTA | COMO FECHAR O GAP |
|---|---|---|
| `schemas/query.ts` com `{ answer, source_document, confidence }` | Schema não é **enforced** no runtime — resposta pode sair sem `source_document` | `QueryResponseSchema` em Zod com `source_document: z.string().min(1)` (não-opcional); `CompletionService.complete()` DEVE chamar `.parse()` no retorno do LLM antes de repassar adiante |
| AGENTS.md exige Zod em toda entrada/saída | Módulo de feedback gerado por Copilot ignorou isso (sem Zod, logou dado sensível) | Regra de CI: lint customizado (ESLint rule ou script) que falha o build se um arquivo em `src/services/` ou `src/functions/` não importar de `zod` — bloqueia merge de módulos como o de feedback |
| pino como logger padrão | Nada impede `console.log` ou log de dado sensível (PII do atendente) em módulos novos | Regra ESLint `no-console: error` + função `logger.redact` configurada em `src/shared/logger.ts` para mascarar campos como `atendenteId`, `emailCliente` automaticamente |

**(b) Probabilísticos — via prompt**

| O QUE JÁ EXISTE | O QUE FALTA | COMO FECHAR O GAP |
|---|---|---|
| System prompt já instruído (ADR-0002/0003) a "cada pergunta é respondida com base nos documentos recuperados" e a nunca escolher silenciosamente entre docs conflitantes | Guardrails de produto (DEVE/NÃO DEVE/QUANDO EM DÚVIDA) do Product Specialist não estão claramente versionados junto ao prompt de produção | Consolidar os guardrails de produto como seção dedicada em `prompts/system-prompt.md` (hoje ainda na v1, 6 linhas, sem guardrails — versionado em Git, conforme AGENTS.md 4.5), com bloco explícito "QUANDO EM DÚVIDA: cite a incerteza e reduza `confidence`" |
| Regra de não alucinar fonte já reforçada por instrução de prompt | Falta instrução explícita de **auto-relato de baixa confiança**, dado que 12% das respostas são incorretas | Adicionar ao system prompt: "Se não houver chunk com similaridade suficiente para sustentar a resposta, DEVES retornar `confidence` abaixo de 0.5 e um `answer` indicando que a informação não foi encontrada — nunca complete a lacuna com conhecimento geral" |

**(c) Human-in-the-loop**

| Ponto concreto | Critério de disparo |
|---|---|
| Fila de revisão humana no painel web (`src/web/review-queue`) | Dispara quando: `confidence < 0.6` **OU** `verificationFailed === true` (claim não sustentado pelo chunk) **OU** `conflict_status === 'flagged'` **OU** `source_document` ausente/inválido após Zod parse. Nesses casos, a resposta ao Teams é substituída por "Estou verificando essa informação com a área responsável" e a query cai na fila para um atendente sênior validar antes (ou depois, com correção retroativa) |

---

### 5. Observability

**Logs (obrigatório em todo log de query, via pino)**

`requestId`, `timestamp`, `userId` (anonimizado/hash), `query` (truncada/mascarada se contiver PII), `intentClassification` (single/multi-domínio), `chunksReturned`, `chunksTruncated`, `historyTurnsUsed`, `tokensUsed` (por bloco: system/chunks/histórico/query/resposta), `confidence`, `sourceDocument`, `conflictStatus`, `verificationFailed`, `durationMs`, `llmModel`.

**Métricas**

| Métrica | Por quê |
|---|---|
| % de respostas sem `source_document` válido | Indicador direto do problema já descoberto (schema não force isso hoje); meta: 0% pós-guardrail |
| % de respostas com `confidence < 0.6` | Proxy do risco de alucinação; correlaciona com os 12% de erro medidos em teste |
| % de queries com `conflict_status: flagged` | Alimenta o dashboard de governança da ADR-0003; mostra pressão institucional acumulada |
| p95 de latência por query | Critério de produção definido na ADR-0003 (p95 ≤ X s) |
| % de queries truncadas para top-4 (score do 5º chunk < 0.60) | Indica cobertura documental insuficiente para certos temas — insumo para saber quais áreas documentais precisam de mais conteúdo |
| Taxa de acionamento da fila human-in-the-loop | Mede se o guardrail está sendo disparado na frequência esperada (nem 0%, nem excessivo a ponto de inviabilizar operação) |
| Cobertura de citação (% respostas com fonte citada e válida) | Critério de produção explícito da ADR-0003 (≥ 99%) |

**Alertas**

| Condição | Dispara para |
|---|---|
| % de respostas sem fonte válida > 1% em janela de 1h | Tech Lead + squad de dev (Slack/Teams do time) |
| p95 de latência > limite da ADR-0003 por 15 min seguidos | On-call de infraestrutura |
| Taxa de `conflict_status: flagged` cresce sem resolução em 24h (dashboard de governança) | Áreas responsáveis (Operações/Compliance/Comercial) + Product Specialist |
| CI detecta merge que viola regra Zod/no-console (guardrail determinístico da camada 4a) | Autor do PR + Tech Lead, bloqueando o merge automaticamente |
| Fila human-in-the-loop ultrapassa capacidade dos atendentes-piloto (ex: > 20% das queries em revisão) | Delivery Manager — sinal de que o guardrail está bom, mas o modelo/dados precisam de ajuste antes do go-live |