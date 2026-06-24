# AGENTS.md — NovaTech Assistant

> **Para agentes de IA:** Leia este arquivo integralmente antes de gerar qualquer artefato neste repositório.
> Este documento é prescritivo — cada regra marcada com **DEVE**, **NÃO DEVE** ou **NUNCA** é obrigatória.
> Em caso de conflito entre este arquivo e um comentário inline no código, este arquivo prevalece.

---

## Índice

1. [Visão Geral do Projeto](#1-visão-geral-do-projeto)
2. [Stack Técnica & Arquitetura](#2-stack-técnica--arquitetura)
3. [Padrões de Código](#3-padrões-de-código)
4. [Build & Deploy](#4-build--deploy)

---

## 1. Visão Geral do Projeto

### O que é o NovaTech Assistant

O NovaTech Assistant é um assistente de IA para atendimento ao cliente interno de uma empresa de logística com 1.200 funcionários. Ele permite que a equipe de atendimento (45 pessoas) faça perguntas em linguagem natural e receba respostas embasadas na documentação oficial da empresa, com indicação explícita de fonte.

### Problema que resolve

A equipe gasta em média **12 minutos por chamado** buscando informações dispersas em SharePoint, Confluence e planilhas. Com **320 chamados/dia** e ~60% envolvendo busca em documentação, o assistente elimina esse atrito por meio de RAG (Retrieval-Augmented Generation) sobre as bases documentais existentes.

### Canais de acesso

| Canal | Implementação |
|---|---|
| Microsoft Teams | Bot Framework SDK |
| Painel web interno | React (SPA) |

### Estrutura do repositório

```
novatech-assistant/
├── AGENTS.md                  ← este arquivo
├── src/
│   ├── functions/             # Azure Functions — HTTP triggers (endpoints)
│   ├── services/              # Lógica de negócio: search, completion, prompt-builder
│   ├── pipeline/              # Pipeline de ingestão de documentos
│   ├── bot/                   # Bot do Microsoft Teams
│   ├── web/                   # Painel React
│   └── shared/                # Tipos compartilhados, config, logger, errors
├── specs/                     # Requirements / plan / tasks por módulo (SDD)
├── skills/                    # Foundation → Domain → Artifact
├── prompts/                   # System prompts versionados
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
└── docs/adr/                  # Architecture Decision Records
```

Cada diretório em `src/` é um módulo com responsabilidade única. **NÃO DEVE** haver imports cruzados entre `functions/`, `services/`, `pipeline/`, `bot/` e `web/` — toda dependência compartilhada DEVE residir em `shared/`.

---

## 2. Stack Técnica & Arquitetura

### 2.1 Decisões de arquitetura (ADRs)

Todas as escolhas de tecnologia estão documentadas em `docs/adr/`. Nunca reverta uma decisão de ADR sem criar um novo ADR de substituição.

| ADR | Decisão |
|---|---|
| ADR-0001 | Modelo LLM: Azure OpenAI GPT-4o |
| ADR-0002 | Orçamento de tokens e regras de contexto (detalhado abaixo) |
| ADR-0003 | Tratamento de documentos contraditórios |
| ADR-0004 | Pipeline de RAG: Azure AI Search + Azure OpenAI |

### 2.2 Stack definida

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js — TypeScript com `strict: true` |
| Backend | Azure Functions v4, HTTP triggers |
| LLM | Azure OpenAI GPT-4o |
| Busca vetorial | Azure AI Search |
| Validação | Zod |
| Testes | Vitest |
| Logging | pino |
| Web | React |
| Infra (IaC) | Bicep |
| Bot | Bot Framework SDK |

### 2.3 Orçamento de tokens por turno (ADR-0002)

Esta é a regra de contexto mais crítica do projeto. **TODO código que constrói um prompt DEVE respeitar exatamente este orçamento:**

| Componente | Tokens reservados |
|---|---|
| System prompt | 1.500 |
| Chunks RAG (8 chunks × ~500 tokens) | 4.000 |
| Histórico de conversa (janela deslizante) | 2.000 |
| Query do usuário | 300 |
| Buffer para resposta do modelo | 1.200 |
| **Total por turno** | **~9.000** |

#### Regras de recuperação de chunks

- DEVE recuperar **top-8 chunks** ordenados por score de similaridade vetorial (cosine similarity).
- DEVE descartar chunks com score abaixo de **0.75**.
- Se o score do **5º chunk** cair abaixo de **0.60**, DEVE truncar para **top-4** e não incluir os chunks 5–8.
- DEVE aplicar **re-ranqueamento via Azure AI Search Semantic Ranker** antes de enviar os chunks ao LLM.

```typescript
// ✅ CORRETO — truncamento condicional
async function retrieveChunks(query: string): Promise<Chunk[]> {
  const results = await searchClient.search(query, { top: 8 });
  const chunks = results.filter(r => r.score >= 0.75);

  // Trunca para top-4 se o 5º chunk estiver abaixo do limiar
  if (chunks.length >= 5 && chunks[4].score < 0.60) {
    return chunks.slice(0, 4);
  }
  return chunks;
}

// ❌ ERRADO — ignora o limiar do 5º chunk e nunca trunca
async function retrieveChunks(query: string): Promise<Chunk[]> {
  const results = await searchClient.search(query, { top: 8 });
  return results.filter(r => r.score >= 0.75);
}
```

#### Regras de histórico de sessão

- DEVE manter apenas as **últimas 3 trocas completas** (pergunta + resposta) na janela de contexto.
- **NUNCA** resumir trocas anteriores — descartar silenciosamente é o comportamento correto.
- Trocas mais antigas que a janela de 3 DEVEM ser descartadas sem nenhuma forma de compressão.

```typescript
// ✅ CORRETO — descarta trocas além da janela de 3
function buildHistory(turns: ConversationTurn[]): ConversationTurn[] {
  return turns.slice(-3); // mantém apenas as 3 últimas trocas
}

// ❌ ERRADO — resumir trocas anteriores viola a ADR-0002
function buildHistory(turns: ConversationTurn[]): ConversationTurn[] {
  const recent = turns.slice(-3);
  const summary = summarizeOlderTurns(turns.slice(0, -3)); // PROIBIDO
  return [{ role: 'system', content: summary }, ...recent];
}
```

#### Tratamento de documentos contraditórios (ADR-0003)

Quando dois ou mais chunks recuperados apresentarem informações contraditórias, o assistente **DEVE** sempre apresentar ambas as versões ao usuário, incluindo os metadados de vigência (área responsável + data de vigência). **NUNCA** escolher silenciosamente uma versão, mesmo que uma pareça mais recente.

```typescript
// ✅ CORRETO — expõe a contradição com metadados
function formatConflictingChunks(chunks: Chunk[]): string {
  return chunks.map(c =>
    `[Fonte: ${c.source} | Área: ${c.owner} | Vigência: ${c.validFrom}]\n${c.content}`
  ).join('\n\n---\n\n');
}

// ❌ ERRADO — escolhe silenciosamente o chunk mais recente
function formatConflictingChunks(chunks: Chunk[]): string {
  const latest = chunks.sort((a, b) =>
    new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
  )[0];
  return latest.content; // PROIBIDO — descarta versões conflitantes
}
```

### 2.4 Fluxo de uma query

```
Usuário (Teams / Web)
        │
        ▼
  Azure Function (HTTP trigger)
        │  valida input com Zod
        ▼
  PromptBuilder (src/services/prompt-builder.ts)
        │  monta histórico (≤ 3 trocas) + chunks + system prompt
        ▼
  SearchService (src/services/search.ts)
        │  Azure AI Search → cosine similarity → Semantic Ranker
        ▼
  CompletionService (src/services/completion.ts)
        │  Azure OpenAI GPT-4o
        ▼
  Resposta com citação de fonte
```

---

## 3. Padrões de Código

### 3.1 TypeScript

- DEVE usar `strict: true` no `tsconfig.json`. Nunca desabilitar flags individuais de strict para contornar erros.
- **NUNCA** usar `any`. Use `unknown` e faça narrowing explícito.
- DEVE exportar tipos via `export type` — nunca misturar com exports de valor no mesmo statement quando desnecessário.

```typescript
// ✅ CORRETO
function parsePayload(raw: unknown): QueryPayload {
  return QueryPayloadSchema.parse(raw); // Zod faz o narrowing
}

// ❌ ERRADO
function parsePayload(raw: any): any {
  return raw;
}
```

### 3.2 Validação com Zod

- DEVE validar **toda entrada externa** (HTTP body, parâmetros de query, variáveis de ambiente) com um schema Zod antes de usar os dados.
- DEVE validar a **saída do LLM** antes de retornar ao cliente.
- Schemas DEVEM ser definidos em `src/shared/schemas/` e reutilizados entre functions e services.

```typescript
// ✅ CORRETO — schema em shared, reusado no handler
import { QueryPayloadSchema } from '@/shared/schemas/query';

export async function handler(req: HttpRequest): Promise<HttpResponseInit> {
  const body = QueryPayloadSchema.parse(await req.json());
  // ...
}

// ❌ ERRADO — validação inline sem schema compartilhado
export async function handler(req: HttpRequest): Promise<HttpResponseInit> {
  const body = await req.json();
  if (!body.query || typeof body.query !== 'string') throw new Error('invalid');
  // ...
}
```

### 3.3 Logging

- DEVE usar `pino` importado de `src/shared/logger.ts` para **todo log de aplicação**.
- **NUNCA** usar `console.log`, `console.error`, `console.warn` ou qualquer método `console.*` em código de produção.
- Logs DEVEM incluir contexto estruturado: `requestId`, `userId` (anonimizado), `durationMs`.

```typescript
// ✅ CORRETO
import { logger } from '@/shared/logger';

logger.info({ requestId, durationMs: end - start }, 'query completed');

// ❌ ERRADO
console.log('query completed in', end - start, 'ms');
```

### 3.4 Tratamento de erros

- DEVE criar classes de erro customizadas em `src/shared/errors/` para cada categoria de falha (ex: `RagRetrievalError`, `LlmCompletionError`, `ValidationError`).
- **NUNCA** capturar um erro e descartá-lo silenciosamente (`catch (e) {}`).
- Errors capturados em Azure Functions DEVEM retornar HTTP status codes semânticos e um body com `{ code, message, requestId }`.

```typescript
// ✅ CORRETO
import { RagRetrievalError } from '@/shared/errors';

try {
  const chunks = await retrieveChunks(query);
} catch (cause) {
  throw new RagRetrievalError('Failed to retrieve chunks', { cause });
}

// ❌ ERRADO — captura silenciosa
try {
  const chunks = await retrieveChunks(query);
} catch (_) {}
```

### 3.5 Testes

- DEVE escrever testes com **Vitest**. Nenhuma outra framework de testes DEVE ser adicionada.
- Todo arquivo em `src/services/` DEVE ter cobertura de testes unitários correspondente em `tests/unit/`.
- Fixtures reutilizáveis DEVEM estar em `tests/fixtures/` e nunca duplicadas entre arquivos de teste.
- Mocks de clientes Azure (OpenAI, AI Search) DEVEM usar `vi.mock` e ser centralizados em `tests/fixtures/azure-mocks.ts`.

```typescript
// ✅ CORRETO — usa fixture centralizada
import { mockSearchClient } from '@/tests/fixtures/azure-mocks';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@azure/search-documents', () => mockSearchClient);

describe('retrieveChunks', () => {
  it('truncates to top-4 when 5th chunk score < 0.60', async () => {
    // ...
  });
});

// ❌ ERRADO — mock inline duplicado
vi.mock('@azure/search-documents', () => ({
  SearchClient: vi.fn().mockImplementation(() => ({ search: vi.fn() }))
}));
```

### 3.6 Commits

- DEVE seguir o padrão **Conventional Commits**: `<type>(<scope>): <description>`.
- Types permitidos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.
- O `scope` DEVE corresponder a um dos módulos do repositório: `functions`, `services`, `pipeline`, `bot`, `web`, `shared`, `infra`.

```
# ✅ CORRETO
feat(services): add semantic ranker step to chunk retrieval
fix(functions): return 422 when Zod validation fails on query endpoint
test(services): add unit tests for context window truncation logic

# ❌ ERRADO
Update search logic
fixed bug
WIP
```

### 3.7 Organização de imports

- DEVE usar o alias `@/` mapeado para `src/` para imports internos. Nunca usar caminhos relativos com mais de um nível (`../../`).

```typescript
// ✅ CORRETO
import { logger } from '@/shared/logger';
import { QueryPayloadSchema } from '@/shared/schemas/query';

// ❌ ERRADO
import { logger } from '../../shared/logger';
```

### 3.8 Variáveis de ambiente

- DEVE acessar variáveis de ambiente **apenas** por meio de `src/shared/config.ts`, que DEVE validá-las com Zod ao inicializar.
- **NUNCA** acessar `process.env` diretamente em services ou functions.

```typescript
// ✅ CORRETO — src/shared/config.ts centraliza e valida
import { config } from '@/shared/config';
const endpoint = config.azureOpenAiEndpoint;

// ❌ ERRADO — acesso direto e sem validação
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
```

---

## 4. Build & Deploy

### 4.1 Scripts NPM

| Script | O que faz |
|---|---|
| `npm run build` | Compila TypeScript via `tsc` |
| `npm run lint` | Executa ESLint (zero warnings tolerados) |
| `npm run test` | Executa suite completa com Vitest |
| `npm run test:unit` | Apenas testes unitários |
| `npm run test:integration` | Apenas testes de integração |
| `npm run deploy:infra` | Faz deploy da infra Bicep via Azure CLI |
| `npm run deploy:functions` | Faz deploy das Azure Functions |

**NUNCA** fazer deploy manual de recursos Azure fora dos scripts acima. Toda infraestrutura DEVE ser provisionada via Bicep em `infra/`.

### 4.2 Branch strategy

- `main` é a branch de produção. **NUNCA** fazer push direto para `main`.
- Todo trabalho DEVE ocorrer em **feature branches** com o padrão `<type>/<scope>-<description>`:

```
# ✅ CORRETO
feat/services-semantic-ranker
fix/functions-zod-validation
docs/adr-0005-caching-strategy

# ❌ ERRADO
minha-branch
update
fix2
```

- Todo merge para `main` DEVE ser feito via **Pull Request** com ao menos 1 aprovação.
- O CI DEVE passar (`build` + `lint` + `test`) antes do merge ser permitido.

### 4.3 CI Pipeline (obrigatório antes do merge)

O pipeline DEVE executar, em ordem:

1. `npm run build` — falha bloqueia os passos seguintes
2. `npm run lint` — zero warnings; qualquer warning trata como erro
3. `npm run test` — cobertura mínima de **80%** em `src/services/`
4. Scan de secrets (ex: credenciais Azure hardcoded) — falha bloqueia o merge

### 4.4 Infra como código (Bicep)

- Toda infraestrutura Azure DEVE ser declarada em `infra/` como arquivos Bicep.
- **NUNCA** criar ou modificar recursos Azure manualmente pelo portal ou CLI fora do pipeline de IaC.
- Parâmetros sensíveis (connection strings, API keys) DEVEM ser referenciados via **Azure Key Vault** — **NUNCA** hardcoded em arquivos Bicep ou em código.

```bicep
// ✅ CORRETO — referencia Key Vault
param openAiKey string = az.getSecret(keyVaultName, 'azure-openai-key')

// ❌ ERRADO — chave hardcoded
param openAiKey string = 'sk-abc123...'
```

### 4.5 System prompts versionados

- System prompts DEVEM residir em `prompts/` como arquivos `.md` versionados no Git.
- **NUNCA** definir system prompts como strings inline em código TypeScript.
- Mudanças em system prompts DEVEM passar pelo mesmo fluxo de PR que mudanças de código.

```typescript
// ✅ CORRETO — carrega do sistema de arquivos
import { readFileSync } from 'fs';
const systemPrompt = readFileSync('prompts/assistant-v2.md', 'utf-8');

// ❌ ERRADO — prompt inline no código
const systemPrompt = `Você é um assistente de logística...`;
```

---

> **Última atualização:** veja histórico de commits deste arquivo.
> **Mantenedor:** arquitetura@novatech.com.br
> **ADRs relacionadas:** `docs/adr/ADR-0001` a `ADR-0004`
