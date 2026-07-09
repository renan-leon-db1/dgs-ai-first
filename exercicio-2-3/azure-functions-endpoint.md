# Skill: azure-functions-endpoint

## 1. Activation

> Use esta skill sempre que for criar, modificar ou revisar um Azure Function HTTP trigger neste projeto (NovaTech Assistant).

Gatilhos específicos:
- Pedido para "criar um endpoint", "criar uma function", "criar uma rota HTTP", "expor uma API".
- Qualquer arquivo novo dentro de `src/functions/**`.
- Alteração de um handler HTTP existente (`app.http(...)`).

Se o pedido for para criar um endpoint **de RAG** (que consulta Azure AI Search + Azure OpenAI), esta skill ainda se aplica, mas a skill de Artifact `create-rag-endpoint` deve ser lida **depois** desta, pois adiciona regras específicas de RAG por cima da estrutura genérica de endpoint definida aqui.

## 2. Context

### Cobre
- Estrutura de arquivos de um HTTP trigger em Azure Functions v4 (modelo de programação `app.http`).
- Validação de input/output com Zod.
- Tratamento de erros e mapeamento para status HTTP.
- Logging estruturado com pino (incluindo correlação de request).
- Contrato de resposta (formato de sucesso e de erro).
- Registro da function e configuração de rota/auth level.

### Fora de escopo (não cobre)
- Lógica de negócio de RAG (busca vetorial, prompt, geração) → `create-rag-endpoint`.
- Estrutura de testes de integração → `create-integration-test`.
- Componentes de UI/React → `create-react-card`.
- Configuração de infraestrutura (Bicep/Terraform, App Settings, Managed Identity).

### Foundation skills que devem ser lidas antes
1. `typescript-conventions` — strict mode, tipagem de retorno, proibição de `any`.
2. `error-handling` — hierarquia de erros customizados e formato de erro padrão do projeto.
3. `project-structure` — onde cada arquivo deve morar no monorepo/projeto.

Sem essas três, o Copilot tende a gerar `any` implícito, `try/catch` genérico com `console.log`, e arquivos fora do padrão de pastas.

## 3. Required Structure

Para cada endpoint `<nome>` (kebab-case, ex: `ticket-status`), criar exatamente:

```
src/functions/<nome>/
├── index.ts          # Registro da function (app.http) + handler
├── schema.ts         # Schemas Zod de input e output
├── handler.ts         # Lógica pura do endpoint (testável sem HTTP)
└── <nome>.test.ts     # Testes unitários (Vitest)
```

Responsabilidade de cada arquivo:

- **`index.ts`**: só faz o "wiring". Importa `handler.ts` e `schema.ts`, registra a rota com `app.http`, parseia `req`, chama o handler, serializa a resposta. Não contém lógica de negócio.
- **`schema.ts`**: exporta `<Nome>InputSchema` e `<Nome>OutputSchema` (Zod), e os tipos inferidos `type <Nome>Input = z.infer<typeof <Nome>InputSchema>`.
- **`handler.ts`**: exporta uma função pura `async function handle<Nome>(input: <Nome>Input, deps: ...): Promise<<Nome>Output>`. Não conhece `HttpRequest`/`HttpResponse` do Azure Functions.
- **`<nome>.test.ts`**: testa `handler.ts` isoladamente (sem subir o runtime de Azure Functions).

Nome da rota HTTP = nome da pasta (kebab-case). Nome da function registrada em `app.http(...)` = mesmo nome em camelCase.

## 4. Rules (prescritivas)

### Estrutura
- **DEVE** separar `index.ts` (wiring HTTP) de `handler.ts` (lógica pura).
- **DEVE** colocar schemas Zod em `schema.ts` próprio, nunca inline dentro do handler.
- **NÃO DEVE** conter lógica de negócio (chamadas a serviços externos, regras de decisão) dentro de `index.ts`.
- **NÃO DEVE** criar arquivos adicionais de validação (ex: `validator.ts`, `validation.ts`, `input-validator.ts`) — toda validação de input/output deste endpoint vive exclusivamente em `schema.ts`, mesmo que esse não seja o nome mais comum para esse propósito em outros projetos/ecossistemas.

### Validação
- **DEVE** validar `request.body` (ou query params) com `<Nome>InputSchema.safeParse(...)` antes de qualquer processamento.
- **DEVE** retornar HTTP 400 com corpo `{ error: { code: "VALIDATION_ERROR", details: ... } }` quando `safeParse` falhar, usando `error.flatten()` ou equivalente do Zod nos `details`.
- **DEVE** validar a saída do handler com `<Nome>OutputSchema.parse(...)` antes de responder (falha de contrato = bug, deve lançar, não retornar 400).
- **NÃO DEVE** usar `any` ou `as` para contornar tipagem do body — sempre passar pelo schema Zod.

### Erros
- **DEVE** capturar erros no `index.ts` com um único `try/catch` no nível do handler HTTP, delegando o mapeamento erro→status para a função utilitária de `error-handling` (ex: `mapErrorToResponse(error)`).
- **DEVE** anotar explicitamente a variável capturada como `catch (error: unknown)` em todo `try/catch` de `index.ts` — a anotação literal `: unknown` é obrigatória no código, mesmo que o `tsconfig` já tenha `useUnknownInCatchVariables` habilitado por padrão. Inferência implícita não é uma regra verificável em code review; a anotação escrita é.
- **DEVE** lançar erros customizados definidos em `error-handling` (ex: `NotFoundError`, `UpstreamServiceError`) dentro de `handler.ts`, nunca `throw new Error("string")` genérico.
- **NÃO DEVE** engolir erros (catch vazio ou catch que só loga e continua sem re-lançar/responder).

### Logging
- **DEVE** usar o logger pino do projeto (`import { logger } from "../../shared/logger"` ou equivalente definido em `project-structure`), nunca `console.log`/`console.error`.
- **DEVE** incluir um `requestId` (do header `x-request-id` ou gerado via `crypto.randomUUID()`) em todo log da requisição, via `logger.child({ requestId })`.
- **DEVE** logar no mínimo: início da requisição (nível `info`), erro (nível `error`, com `err` no objeto de log), e conclusão com duração (nível `info`).
- **NÃO DEVE** logar payloads completos de input/output que contenham dados de cliente sem mascaramento — logar apenas campos identificadores (ex: `ticketId`), nunca o corpo inteiro do request.

### Contrato HTTP
- **DEVE** definir `authLevel` explicitamente em `app.http(...)` (nunca deixar o default implícito).
- **DEVE** definir `methods: ["..."]` explicitamente (nunca omitir, mesmo que só um método).
- **DEVE** retornar `Content-Type: application/json` em toda resposta, inclusive erros.
- **NÃO DEVE** retornar stack trace ou mensagem de erro interna (`error.message` de exceptions não tratadas) diretamente no corpo da resposta ao cliente.

### Tipagem
- **DEVE** ter tipo de retorno explícito em toda função exportada (`handle<Nome>`, e o handler do `app.http`).
- **NÃO DEVE** haver nenhum `any` implícito ou explícito em `index.ts`, `handler.ts` ou `schema.ts`.

## 5. Code Examples

### DO — implementação correta (endpoint de query RAG)

**`src/functions/rag-query/schema.ts`**
```typescript
import { z } from "zod";

export const RagQueryInputSchema = z.object({
  question: z.string().min(3).max(1000),
  conversationId: z.string().uuid().optional(),
});
export type RagQueryInput = z.infer<typeof RagQueryInputSchema>;

export const RagQueryOutputSchema = z.object({
  answer: z.string(),
  source_document: z
    .object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      score: z.number(),
    })
    .nullable(),
});
export type RagQueryOutput = z.infer<typeof RagQueryOutputSchema>;
```

**`src/functions/rag-query/handler.ts`**
```typescript
import { UpstreamServiceError } from "../../shared/errors";
import type { RagQueryInput, RagQueryOutput } from "./schema";
import type { SearchService, SearchChunk } from "../../shared/search-service";
import type { OpenAiClient } from "../../shared/openai-client";

// Orçamento de contexto do prompt (em tokens), fixado pela política de custo do projeto.
const SYSTEM_PROMPT_TOKEN_BUDGET = 2_000;
const CONTEXT_CHUNKS_TOKEN_BUDGET = 8_000;

const SYSTEM_PROMPT = `Você é o assistente de atendimento da NovaTech Logística.
Responda apenas com base no contexto fornecido. Se não souber, diga que não sabe.`;

export interface RagQueryDeps {
  searchService: SearchService;
  openAiClient: OpenAiClient;
}

// Aproximação de 4 caracteres por token — suficiente para controle de orçamento,
// não usada para faturamento.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function selectChunksWithinBudget(chunks: SearchChunk[], budgetTokens: number): SearchChunk[] {
  const selected: SearchChunk[] = [];
  let usedTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.content);
    if (usedTokens + chunkTokens > budgetTokens) {
      break;
    }
    selected.push(chunk);
    usedTokens += chunkTokens;
  }

  return selected;
}

export async function handleRagQuery(
  input: RagQueryInput,
  deps: RagQueryDeps,
): Promise<RagQueryOutput> {
  if (estimateTokens(SYSTEM_PROMPT) > SYSTEM_PROMPT_TOKEN_BUDGET) {
    throw new UpstreamServiceError("system prompt excede o orçamento de tokens configurado");
  }

  const chunks = await deps.searchService.search(input.question);
  const contextChunks = selectChunksWithinBudget(chunks, CONTEXT_CHUNKS_TOKEN_BUDGET);

  const contextText = contextChunks.map((chunk) => chunk.content).join("\n---\n");

  const completion = await deps.openAiClient.complete({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Contexto:\n${contextText}\n\nPergunta: ${input.question}`,
  });

  const topChunk = contextChunks[0];

  return {
    answer: completion.text,
    source_document: topChunk
      ? {
          id: topChunk.documentId,
          title: topChunk.documentTitle,
          url: topChunk.documentUrl,
          score: topChunk.score,
        }
      : null,
  };
}
```

**`src/functions/rag-query/index.ts`**
```typescript
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { logger } from "../../shared/logger";
import { mapErrorToResponse } from "../../shared/error-handling";
import { searchService } from "../../shared/search-service";
import { openAiClient } from "../../shared/openai-client";
import { RagQueryInputSchema, RagQueryOutputSchema } from "./schema";
import { handleRagQuery } from "./handler";

async function ragQuery(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const log = logger.child({ requestId, function: "ragQuery" });
  const startedAt = Date.now();

  log.info({ url: request.url }, "request started");

  const rawBody = await request.json().catch(() => null);
  const parsedInput = RagQueryInputSchema.safeParse(rawBody);

  if (!parsedInput.success) {
    log.info({ issues: parsedInput.error.flatten() }, "validation failed");
    return {
      status: 400,
      jsonBody: {
        error: { code: "VALIDATION_ERROR", details: parsedInput.error.flatten() },
      },
    };
  }

  try {
    const result = await handleRagQuery(parsedInput.data, { searchService, openAiClient });
    const output = RagQueryOutputSchema.parse(result);

    log.info(
      { sourceDocumentId: output.source_document?.id ?? null, durationMs: Date.now() - startedAt },
      "request completed",
    );

    return {
      status: 200,
      jsonBody: output,
    };
  } catch (error: unknown) {
    log.error({ err: error }, "request failed");
    return mapErrorToResponse(error);
  }
}

app.http("ragQuery", {
  route: "rag-query",
  methods: ["POST"],
  authLevel: "function",
  handler: ragQuery,
});
```

---

### DON'T — os anti-padrões reais que o Copilot gera para este endpoint

```typescript
// src/functions/rag-query/index.ts  (VERSÃO ERRADA — NÃO FAZER)
import { app } from "@azure/functions";
import { OpenAI } from "openai";
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

// ❌ configuração hardcoded em vez de variável de ambiente (shared/config.ts)
const searchClient = new SearchClient(
  "https://novatech-search.search.windows.net",
  "documents-index",
  new AzureKeyCredential("AbCdEf1234567890HardcodedKey=="),
);

const openai = new OpenAI({
  apiKey: "sk-hardcoded-key-not-from-env", // ❌ chave de API hardcoded
});

app.http("ragQuery", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request: any, context: any) => { // ❌ any implícito
    try {
      const body = await request.json();
      const question = body.question; // ❌ sem validação Zod, sem checar shape/tamanho

      console.log("pergunta recebida:", question); // ❌ console.log em vez de pino

      const searchResults = await searchClient.search(question);
      const chunks: string[] = [];
      for await (const result of searchResults.results) {
        chunks.push(result.document.content); // ❌ sem orçamento de tokens/contexto
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um assistente." },
          { role: "user", content: `${chunks.join("\n")}\n\n${question}` },
        ],
      });

      return {
        status: 200,
        jsonBody: {
          answer: completion.choices[0]?.message?.content ?? "", // ❌ sem source_document no retorno
        },
      };
    } catch (e) { // ❌ catch(e) sem tipagem, sem mapeamento de erro
      console.log("deu erro", e); // ❌ console.log de novo
      return {
        status: 500,
        jsonBody: { message: "erro interno" },
      };
    }
  },
});
```

## 6. Anti-patterns

| # | O que o Copilot gera | Por que está errado | Correção |
|---|---|---|---|
| 1 | `console.log("pergunta recebida:", question)` e `console.log("deu erro", e)` | Perde estrutura de log, correlação por `requestId` e nível de severidade; proíbe agregação em ferramentas de observabilidade; viola regra explícita de "nunca `console.log`" | Usar `logger.child({ requestId })` e logar objetos estruturados (`log.info({...}, "mensagem")` / `log.error({ err }, "mensagem")`) |
| 2 | `const question = body.question;` direto do JSON, sem `RagQueryInputSchema.safeParse(...)` | Nenhuma garantia de shape/tamanho da pergunta em runtime; permite prompt injection via input não sanitizado e perguntas vazias/gigantes indo direto para o modelo | Sempre `Schema.safeParse(rawBody)`, responder 400 com `VALIDATION_ERROR` em caso de falha, e usar `parsedInput.data` tipado |
| 3 | `catch (e) { ... return { status: 500, jsonBody: { message: "erro interno" } } }` | `e` sem anotação de tipo (mesmo que o TS infira `unknown` por padrão, a anotação literal `: unknown` não está escrita, o que a regra exige); todo erro cai em 500 genérico, sem distinguir falha de validação, de busca (`UpstreamServiceError`) ou de negócio; perde rastreabilidade da causa raiz | Escrever sempre `catch (error: unknown)` e delegar para `mapErrorToResponse(error)` de `error-handling`, usando erros customizados tipados lançados em `handler.ts` |
| 4 | Retorno `{ answer: completion.choices[0]?.message?.content ?? "" }`, sem `source_document` | Quebra o contrato de saída do endpoint RAG: o cliente (UI ou outro serviço) não consegue exibir a fonte/citação da resposta, exigido para rastreabilidade em atendimento ao cliente | Incluir sempre `source_document` no output (o chunk/documento de maior score usado no contexto, ou `null` se nenhum chunk foi relevante), validado por `RagQueryOutputSchema` |
| 5 | `new SearchClient("https://novatech-search.search.windows.net", ..., new AzureKeyCredential("AbCdEf..."))` e `new OpenAI({ apiKey: "sk-hardcoded-key-not-from-env" })` | Credenciais e endpoints hardcoded no código-fonte: vão para o Git, não podem variar por ambiente (dev/staging/prod), e vazam segredos em code review/logs | Ler endpoint e chave de `shared/config.ts`, que por sua vez lê de variáveis de ambiente (`AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`), nunca literais no código |
| 6 | Concatena todos os chunks retornados pela busca sem limite (`chunks.push(...)` em loop, sem orçamento) | Sem controle de orçamento de contexto, o prompt pode exceder o limite de tokens do modelo ou inflar custo/latência de forma imprevisível | Aplicar `selectChunksWithinBudget(chunks, CONTEXT_CHUNKS_TOKEN_BUDGET)` respeitando o orçamento fixado do projeto (2K tokens para system prompt, 8K para chunks de contexto) |

## 7. Dependencies

Carregar, nesta ordem, antes de aplicar esta skill:

1. **`typescript-conventions`** — define as regras de strict mode, proibição de `any`, e estilo de tipos que esta skill assume como já conhecidas (ex: por que `handler.ts` precisa de tipo de retorno explícito).
2. **`error-handling`** — define a hierarquia de erros customizados (`NotFoundError`, `ValidationError`, `UpstreamServiceError`) e a função `mapErrorToResponse`, usadas diretamente no bloco `catch` do `index.ts`.
3. **`project-structure`** — define onde `shared/logger.ts`, `shared/error-handling.ts` e demais módulos compartilhados vivem, para que os imports em `index.ts` apontem para o lugar certo.

Depois desta skill, ao criar um endpoint específico, carregar a skill de Artifact correspondente:
- `create-rag-endpoint` — se o endpoint fizer busca vetorial + geração.
- `create-integration-test` — para gerar os testes de integração (além dos unitários já cobertos aqui).