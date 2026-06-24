# Análise AGENTS.md v1 — O que o Copilot Seguiu vs Ignorou

## Rodada 1

### Endpoint (copilot-output-round1-endpoint.ts)

| Convenção no AGENTS.md | Status | Evidência no código |
|---|---|---|
| TypeScript strict mode (sem `any`, uso de `unknown`) | ✅ Seguiu | Todos os parâmetros tipados explicitamente: `error: unknown` no catch, `body: unknown` implícito via Zod em `validateQueryPayload`. Nenhum uso de `any` detectado. |
| Azure Functions v4 syntax (`app.http()`) | ✅ Seguiu | `app.http('query', { methods: ['POST'], authLevel: 'anonymous', route: 'query', handler: queryHandler })` no fim do arquivo. |
| Zod para validação de input | ⚠️ Parcial | `validateQueryPayload(await request.json())` — a chamada existe e o comportamento é correto, mas a implementação está em `@/functions/query/validator`, **fora** de `src/shared/schemas/` como exige o AGENTS.md. O schema não é reutilizável entre functions e services. |
| pino para logging (nunca `console.log`) | ✅ Seguiu | `import { logger } from '@/shared/logger'` com `logger.info(...)` e `logger.warn(...)` / `logger.error(...)`. Nenhuma ocorrência de `console.*`. |
| Log com contexto estruturado (`requestId`, `userId`, `durationMs`) | ✅ Seguiu | `logger.info({ requestId, userId, durationMs }, 'query completed')` — todos os três campos obrigatórios presentes. |
| `userId` anonimizado no log | ✅ Seguiu | Função `anonymizeSessionId` transforma o `sessionId` em `anon-<últimos 6 chars>` antes do log. |
| Resposta com campo `source_document` | ✅ Seguiu | Delegado a `buildQueryResponse(completion, chunks)` — o teste da Rodada 1 valida `source_document: 'SLA-2024-tabela-sla-clientes.md'` no `jsonBody`, confirmando que o contrato é cumprido. |
| Custom error types (não `throw new Error()` genérico) | ✅ Seguiu | Imports explícitos de `RagRetrievalError`, `LlmCompletionError`, `ValidationError`, `HttpMethodNotAllowedError` de `@/shared/errors`. Nenhum `throw new Error(...)` genérico. |
| Errors retornam `{ code, message, requestId }` com HTTP status semântico | ✅ Seguiu | Bloco catch usa `error.status`, `error.code`, `error.message` do `AppError` para montar a resposta. Fallback também retorna o mesmo shape. |
| Schema Zod em `src/shared/schemas/` (reutilizável) | ❌ Ignorou | Validator em `@/functions/query/validator` — local privado da function, não no diretório compartilhado. Viola: *"Schemas DEVEM ser definidos em `src/shared/schemas/` e reutilizados entre functions e services."* |
| Context budget / truncamento de chunks (top-8, limiar 0.75/0.60) | ❌ Ignorou | Nenhuma lógica de truncamento ou menção ao orçamento de tokens no handler. A responsabilidade foi delegada inteiramente a `searchRelevantChunks` sem evidência de que a service implementa as regras da ADR-0002. |
| Tratamento de documentos contraditórios (ADR-0003) | ❌ Ignorou | Nenhuma checagem de chunks conflitantes antes de chamar `completeQuery`. Nenhuma chamada a `formatConflictingChunks` ou lógica equivalente. |
| Import alias `@/` (sem caminhos relativos `../../`) | ✅ Seguiu | Todos os imports internos usam `@/shared/...`, `@/services/...`, `@/functions/...`. |
| System prompt carregado de `prompts/` (nunca inline) | N/A | O handler não define system prompt — isso é responsabilidade de `completion.ts`. Não avaliável neste arquivo. |

---

### Teste (copilot-output-round1-test.ts)

| Convenção no AGENTS.md | Status | Evidência no código |
|---|---|---|
| Framework de testes: Vitest (nunca outro) | ✅ Seguiu | `import { beforeEach, describe, expect, it, vi } from 'vitest'` — nenhuma dependência de Jest ou outro runner. |
| Nomenclatura `describe`/`it` com frases descritivas | ✅ Seguiu | `describe('queryHandler')` + `it('should return answer payload when request is valid')`, `it('should return 422 when question field is missing')` etc. — frases em linguagem natural. |
| Arrange / Act / Assert explícitos com comentários | ✅ Seguiu | Todos os 4 testes têm blocos `// arrange`, `// act`, `// assert` comentados consistentemente. |
| Assertions específicas (não apenas `toBeDefined()`) | ✅ Seguiu | `expect(response.status).toBe(200)`, `expect(response.jsonBody).toEqual({...})`, `expect(searchRelevantChunksMock).toHaveBeenCalledTimes(1)` — assertions com valores concretos. |
| Sem acesso a serviços reais (mocks para Azure) | ✅ Seguiu | `vi.mock('@/services/search', ...)` e `vi.mock('@/services/completion', ...)` — nenhuma chamada real a Azure AI Search ou OpenAI. |
| `vi.mock` com mocks centralizados em `tests/fixtures/azure-mocks.ts` | ❌ Ignorou | Mocks definidos inline no próprio arquivo de teste: `const searchRelevantChunksMock = vi.fn()` / `const completeQueryMock = vi.fn()`. Não importa de `tests/fixtures/azure-mocks.ts` conforme exigido. |
| Fixtures reutilizáveis em `tests/fixtures/` | ❌ Ignorou | Helpers `buildRequest` e `buildContext` são funções locais no arquivo de teste. Não estão em `tests/fixtures/` e não são reutilizáveis entre suítes. |
| Cobertura de `src/services/` (unitária) | N/A | Este arquivo testa `src/functions/query/handler` — a cobertura de `src/services/` é uma regra separada, não avaliável neste arquivo. |

---

### Itens Ignorados — Análise de Causa

---

**1. Schema Zod em `src/shared/schemas/` (validator local em vez de compartilhado)**

- **Regra ignorada:** *"Schemas DEVEM ser definidos em `src/shared/schemas/` e reutilizados entre functions e services."* (seção 3.2)
- **Causa provável:** A regra de localização do schema (`src/shared/schemas/`) está descrita **somente em prosa**, sem nenhum trecho de código que mostre o import vindo de `@/shared/schemas/query`. O exemplo de código na seção 3.2 usa `import { QueryPayloadSchema } from '@/shared/schemas/query'`, mas o Copilot provavelmente não correlacionou esse exemplo à restrição de local porque ele aparece **no contexto do handler**, não no contexto de "onde criar o schema". Resultado: o Copilot criou o validator onde fazia sentido imediato (junto da function), ignorando a regra de centralização.
- **Ação:** Adicionar na seção 3.2 um exemplo explícito mostrando a estrutura de diretório e o anti-padrão `@/functions/*/validator.ts` marcado como `// ❌ ERRADO`.

---

**2. Context budget / truncamento de chunks (ADR-0002)**

- **Regra ignorada:** Orçamento de tokens por turno, top-8 chunks, limiares 0.75/0.60, truncamento condicional para top-4. (seção 2.3)
- **Causa provável:** A regra está documentada com excelente detalhe e exemplo de código — mas **somente no contexto de `retrieveChunks` em `src/services/search.ts`**. O AGENTS.md não especifica explicitamente que o *handler* deve verificar ou garantir que esse contrato foi respeitado. O Copilot interpretou corretamente que a lógica pertence à service, mas como nenhuma regra diz "o handler DEVE assegurar-se de que recebeu no máximo 8 chunks" ou "DEVE logar o número de chunks recebidos", o handler foi gerado sem qualquer referência ao contexto de tokens.
- **Ação:** Adicionar na seção 2.3 uma nota explícita do tipo: *"O handler DEVE logar o número de chunks recebidos (`chunksReturned`) como campo estruturado para auditoria do budget."* Isso força o Copilot a produzir evidência observável do respeito ao orçamento.

---

**3. Tratamento de documentos contraditórios (ADR-0003)**

- **Regra ignorada:** *"Quando dois ou mais chunks recuperados apresentarem informações contraditórias, o assistente DEVE sempre apresentar ambas as versões."* (seção 2.3)
- **Causa provável:** A regra descreve o comportamento esperado em nível de *resposta ao usuário*, mas **não especifica onde no fluxo a detecção de conflito deve ocorrer** (handler? prompt-builder? completion service?). O exemplo de código dado (`formatConflictingChunks`) é uma função auxiliar sem contexto de onde ela é chamada. O Copilot não a incluiu porque nenhuma instrução diz "o handler DEVE chamar `detectConflicts(chunks)` antes de invocar `completeQuery`". Instrução ambígua quanto à responsabilidade arquitetural.
- **Ação:** Adicionar na seção 2.3 (ou 2.4, no fluxo de query) um passo explícito entre `SearchService` e `CompletionService`: *"ConflictDetector — verifica chunks contraditórios e formata conforme ADR-0003"*, com assinatura de função e local de implementação (`src/services/conflict-detector.ts`).

---

**4. Mocks centralizados em `tests/fixtures/azure-mocks.ts`**

- **Regra ignorada:** *"Mocks de clientes Azure (OpenAI, AI Search) DEVEM usar `vi.mock` e ser centralizados em `tests/fixtures/azure-mocks.ts`."* (seção 3.5)
- **Causa provável:** A regra usa a palavra **"clientes Azure"** — `SearchClient`, `OpenAIClient` etc. O Copilot gerou mocks das *services internas* (`@/services/search`, `@/services/completion`), não dos SDKs Azure diretamente. Há uma ambiguidade: a regra menciona "clientes Azure" mas o teste em questão está no nível do handler (que não importa SDKs Azure — ele importa services internas). O Copilot seguiu o padrão correto de nível de abstração, mas o AGENTS.md não prevê esse cenário, resultando em mocks inline válidos funcionalmente mas fora do padrão de organização.
- **Ação:** Expandir a seção 3.5 para cobrir também mocks de services internas: *"Mocks de services internas reutilizados entre testes DEVEM residir em `tests/fixtures/service-mocks.ts`."*

---

**5. Fixtures reutilizáveis (`buildRequest`, `buildContext`) fora de `tests/fixtures/`**

- **Regra ignorada:** *"Fixtures reutilizáveis DEVEM estar em `tests/fixtures/` e nunca duplicadas entre arquivos de teste."* (seção 3.5)
- **Causa provável:** A regra usa o critério *"nunca duplicadas"* como gatilho para externalizar fixtures. Como `buildRequest` e `buildContext` aparecem apenas uma vez (neste arquivo), o Copilot não detectou duplicação e não sentiu necessidade de externalizar. A regra é reativa (age quando há duplicação) em vez de proativa (toda factory de teste DEVE estar em `tests/fixtures/`). Instrução subotimamente prescritiva.
- **Ação:** Alterar a redação para: *"Helpers de construção de objetos de teste (factories, builders) DEVEM sempre residir em `tests/fixtures/`, independentemente de quantos arquivos os utilizem no momento."*

---

### Limitações Reconhecidas

- **Context budget é uma regra de runtime, não de estrutura de código.** O AGENTS.md define o orçamento de tokens (1.500 + 4.000 + 2.000 + 300 + 1.200), mas o Copilot não tem como verificar em tempo de geração se o prompt resultante respeitará esses limites. Essa garantia precisa ser enforcement via código (ex: função `assertBudget(tokens)` que lança erro se ultrapassar), não via comentário ou convenção textual. Documentar no AGENTS.md é necessário para rastreabilidade, mas insuficiente para compliance automático.

- **ADR-0003 (documentos contraditórios) requer lógica de detecção semântica.** O Copilot não é capaz de inferir de uma regra textual que deve gerar código de comparação entre chunks. Sem uma assinatura de função definida no AGENTS.md (`detectConflicts(chunks: Chunk[]): ConflictResult`) e sem um teste de exemplo que exercite esse cenário, o Copilot sempre omitirá essa lógica porque ela não emerge naturalmente do fluxo happy path.

- **Regras de localização de arquivo têm baixo sinal para o Copilot.** Convenções como "schemas em `src/shared/schemas/`" são facilmente seguidas quando o arquivo-alvo já existe no repositório (o Copilot o enxerga via contexto). Em repositórios novos ou quando o arquivo não foi gerado ainda, o Copilot tende a criar o artefato no local mais próximo do ponto de uso. Isso é um limite estrutural: o AGENTS.md sozinho não substitui a presença dos arquivos-base no repositório.
