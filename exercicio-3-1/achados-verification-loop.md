## Achados — Revisão da função de verificação de fonte (Exercício 3.1, entregável 2)

**Artefato revisado:** função `verifySourceDocument` gerada via GitHub Copilot.
- `novatech-assistant/src/services/verification/source-verifier.ts`
- `novatech-assistant/src/shared/schemas/verification.ts`
- `novatech-assistant/tests/unit/source-verifier.test.ts`

**Contexto:** parte da camada de *Verification loops* do harness — função que recebe a resposta do modelo e verifica se `source_document` existe na lista de documentos válidos da NovaTech (`POL-001`, `PROC-042`, `PROC-042-v2`, `SLA-2024`, `FAQ-Atendimento`), marcando a resposta como suspeita caso contrário.

---

### Achado 1 (bloqueante) — Incompatibilidade de formato entre o verificador e o dado real do pipeline

**Severidade:** Alta — a função, se plugada ao fluxo real sem ajuste, gera 100% de falso positivo.

**Descrição:** `verifySourceDocument` valida `response.source_document` contra os identificadores curtos (`POL-001`, `SLA-2024`, etc.), conforme pedido no exercício. Porém, o restante do pipeline hoje popula `source_document` com o **nome do arquivo**, não o ID curto:

| Arquivo | Valor real de `sourceDocument` |
|---|---|
| `src/functions/query/response-builder.ts:9` | `chunks[0]?.sourceDocument` (repassado sem transformação) |
| `tests/fixtures/chunks.ts:7` | `'SLA-2024-tabela-sla-clientes.md'` |
| `src/services/search.ts:8` | `'stub-source.md'` |

**Impacto:** se `verifySourceDocument` for chamado no fluxo real de produção (ex: dentro de `response-validator.ts` ou do orquestrador do endpoint de query) sem uma etapa de normalização, toda resposta legítima do assistente seria marcada como `suspicious: true`, tornando o guardrail inútil (ou pior, treinando os atendentes a ignorar o alerta por excesso de falso positivo).

**Como fechar:**
1. Padronizar o pipeline (`response-builder.ts` / `completion.ts` / etapa de indexação) para popular `source_document` com o ID curto do documento, **ou**
2. Introduzir uma função de normalização (`normalizeSourceDocument(filename): string`) que mapeie nomes de arquivo para IDs curtos (ex: `SLA-2024-tabela-sla-clientes.md` → `SLA-2024`) antes de chamar `verifySourceDocument`.

**Status:** Pendente — não corrigido, registrado como achado para tratamento em iteração futura.

---

### Achado 2 (não bloqueante) — Teste não segue a convenção de fixtures centralizadas do projeto

**Severidade:** Baixa — convenção, não funcional.

**Descrição:** `AGENTS.md §3.5` exige que entradas de teste reutilizáveis (ex: objetos `QueryResponse` de exemplo) sejam centralizadas em `tests/fixtures/` e importadas, nunca declaradas inline no arquivo de teste. `source-verifier.test.ts` constrói os três objetos `QueryResponse` (válido, inválido, vazio/undefined) diretamente no arquivo, em vez de reutilizar/estender `tests/fixtures/expected-responses.ts` (padrão já seguido em `tests/unit/query-handler.test.ts`).

**Como fechar:** extrair os três objetos de exemplo para `tests/fixtures/` (novo arquivo, ex: `verification.ts`, ou adicionar a `expected-responses.ts`) e importar no teste.

**Status:** Pendente — não corrigido, registrado como achado.

---

### Itens verificados e aprovados (sem achado)

- Lista de documentos válidos confere exatamente com o exercício.
- Schema Zod definido em `src/shared/schemas/`, nunca inline no serviço (conforme AGENTS.md §3.2).
- Sem uso de `any`; tipo de retorno explícito em `verifySourceDocument`.
- Imports via alias `@/`, sem caminhos relativos profundos.
- Cobertura de teste inclui os 3 cenários pedidos: fonte válida, fonte inválida, fonte vazia/undefined.
