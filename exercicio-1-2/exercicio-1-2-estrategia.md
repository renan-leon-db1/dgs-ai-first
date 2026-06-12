# Exercício 1.2 — Estratégia de Prompt Engineering e Context Engineering

## 1) Prompt como código (versionamento, nomenclatura, testes e governança)

### Estrutura no repositório

```text
/prompts/
  system/
    novatech_assistente_atendimento.v1.md
    novatech_assistente_atendimento.v2.md
  templates/
    resposta_com_fontes.v1.md
  policies/
    guardrails.v1.yaml
/tests/
  prompt_eval_cases.json
/scripts/
  prompt_eval.py
/docs/
  prompt_changelog.md
```

### Convenção de nomes

- `dominio_objetivo.tipoPrompt.vN.ext`
- Exemplo: `novatech_assistente_atendimento.system.v2.md`
- Versão semântica para mudanças maiores de comportamento (`v1`, `v2`, ...).

### Política de alteração

- Quem pode alterar: Tech Lead, Engenheiro(a) responsável por IA e Product Specialist.
- Fluxo obrigatório:
  1. Pull Request com descrição da hipótese de mudança.
  2. Execução do `scripts/prompt_eval.py` em CI.
  3. Aprovação mínima: 1 Tech Lead + 1 Product/QA.
  4. Atualização de `docs/prompt_changelog.md`.

### Estratégia de testes

- Testes de regressão de prompt com casos fixos (`tests/prompt_eval_cases.json`).
- Critérios mínimos automatizados:
  - contém citação de fonte;
  - não contém termos proibidos de alucinação/certeza indevida;
  - para perguntas sem cobertura, declara explicitamente não ter encontrado.
- Gatilhos de execução:
  - em cada PR que altera arquivos em `/prompts`;
  - execução diária para detectar drift de modelo.

---

## 2) Anatomia completa de contexto por query

### Partes estáticas (raramente mudam)

1. **System prompt base**: identidade, escopo, regras de não alucinação, formato da resposta.
2. **Política de guardrails**: instruções de citação obrigatória, português formal, tratamento de conflitos.
3. **Template de resposta**: estrutura em blocos (Resposta, Evidências, Incertezas, Próximos passos).

### Partes dinâmicas (mudam por requisição)

1. **Metadados do cliente**: tier (Gold/Silver/Standard), tipo de chamado, data de abertura, canal.
2. **Chunks recuperados**: top-k com score, fonte, data de vigência, tipo de documento.
3. **Pergunta do atendente**: texto livre.
4. **Histórico da conversa**: últimas interações relevantes (resumo + turnos recentes).

### Orçamento de contexto (estimativa)

Premissa: modelo com 128k tokens. Para evitar degradação por contexto excessivo, usar limite operacional **12k tokens** por requisição.

| Componente | Natureza | Estimativa (tokens) | Observação |
|---|---|---:|---|
| System prompt + guardrails | Estático | 1.200 | Mantido curto e estável |
| Template de resposta | Estático | 200 | Instruções de formato |
| Metadados do cliente | Dinâmico | 150 | Campos estruturados |
| Pergunta do usuário | Dinâmico | 80 | Média por atendimento |
| Histórico recente | Dinâmico | 1.500 | Janela rolante + resumo |
| Chunks recuperados (8 x 700) | Dinâmico | 5.600 | Inclui texto + metadados |
| Reserva técnica | Dinâmico | 3.270 | margem para variações |
| **Total operacional** |  | **12.000** | teto por requisição |

### Regras de poda de contexto

- Prioridade: chunks com maior relevância + maior recência + maior confiabilidade documental.
- Perguntas multi-domínio: usar `top-k` por domínio (ex.: 3 SLA + 3 frete + 2 devolução), em vez de um único ranking global.
- Histórico crescente: manter resumo da conversa e apenas os últimos 4 turnos completos.
- Se estourar orçamento: reduzir histórico antes de reduzir chunks críticos.

---

## 3) Prompt base proposto (evolução do protótipo)

```text
Você é o assistente de atendimento da NovaTech (logística), operando em ambiente corporativo.

Objetivo:
- Responder perguntas sobre SLAs, frete, devolução, compliance e procedimentos operacionais.

Regras obrigatórias:
1) Use exclusivamente as informações presentes no contexto recuperado.
2) Sempre cite as fontes com identificador do documento/chunk no formato [FONTE: <id>].
3) Nunca invente prazos, valores, percentuais ou políticas não evidenciadas.
4) Quando a informação não estiver disponível, declare explicitamente:
   "Não encontrei informação suficiente na base documental fornecida."
   e sugira encaminhamento ao supervisor.
5) Em caso de fontes contraditórias, apresente as versões em separado com data/vigência e sinalize conflito.
6) Responda em português formal e claro.

Formato da resposta:
- Resposta objetiva
- Evidências e fontes
- Observações de conflito/limitação (se houver)
```

---

## 4) Relação Prompt x Harness (probabilístico vs determinístico)

### Enforçado no prompt (probabilístico)

- Tom formal em português.
- Estrutura de resposta.
- Preferência por fontes mais recentes.
- Comportamento esperado em caso de conflito documental.

### Enforçado fora do prompt (determinístico no harness)

- Validador regex para citação obrigatória (`[FONTE: ...]`).
- Bloqueio de termos proibidos de alucinação absoluta (ex.: "com certeza", "garantido") quando sem evidência.
- Regra de cobertura: se pergunta marcada como "sem cobertura", resposta deve conter a frase de não-encontro.
- Regra de consistência de tier: rejeitar resposta que use tier inexistente (ex.: Platinum).
- Log de auditoria com prompt, contexto, resposta e decisão do validador.

### Princípio de arquitetura

- Prompt orienta o comportamento, mas não substitui validação de saída.
- Guardrail crítico para risco de negócio deve ser externo ao modelo (determinístico), pois precisa de garantia verificável.
